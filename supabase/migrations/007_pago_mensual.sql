-- 007 · Pago mensual con Webpay a través de Flow (sin Cargo Automático).
-- Cada pago aprobado suma 1 mes de acceso desde la fecha más tardía entre hoy,
-- el fin de la prueba y el último mes pagado. No hay cobros automáticos.

create table if not exists public.pagos (
  commerce_order text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  monto          integer not null,
  estado         text not null default 'pendiente' check (estado in ('pendiente','pagado','rechazado','anulado')),
  flow_order     bigint,
  token          text,
  periodo_hasta  timestamptz,
  created_at     timestamptz not null default now(),
  pagado_at      timestamptz
);
create index if not exists pagos_user_idx on public.pagos (user_id, created_at desc);

alter table public.pagos enable row level security;
drop policy if exists "pagos_ver_propios" on public.pagos;
create policy "pagos_ver_propios" on public.pagos for select to authenticated
  using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.pagos from anon, authenticated;

-- Marca un pago como pagado y extiende el acceso. Idempotente: si Flow avisa dos veces, suma una sola vez.
create or replace function public.registrar_pago(p_order text, p_flow_order bigint)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_hasta timestamptz;
begin
  update public.pagos set estado = 'pagado', flow_order = p_flow_order, pagado_at = now()
  where commerce_order = p_order and estado <> 'pagado'
  returning user_id into v_user;
  if v_user is null then
    select periodo_hasta into v_hasta from public.pagos where commerce_order = p_order;
    return v_hasta;  -- ya estaba registrado (o no existe)
  end if;

  update public.suscripciones
  set estado = 'activa',
      pagado_hasta = greatest(now(), prueba_hasta, coalesce(pagado_hasta, now())) + interval '1 month'
  where user_id = v_user
  returning pagado_hasta into v_hasta;

  update public.pagos set periodo_hasta = v_hasta where commerce_order = p_order;
  return v_hasta;
end $$;
revoke all on function public.registrar_pago(text, bigint) from public, anon, authenticated;
grant execute on function public.registrar_pago(text, bigint) to service_role;

-- Acceso: gratis, en prueba o con un mes pagado vigente.
create or replace function public.tiene_acceso(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select s.gratis or s.prueba_hasta > now() or coalesce(s.pagado_hasta > now(), false)
    from public.suscripciones s where s.user_id = p_user
  ), true);  -- sin fila (cuenta antigua sin migrar): no se bloquea
$$;
revoke all on function public.tiene_acceso(uuid) from public, anon, authenticated;
grant execute on function public.tiene_acceso(uuid) to service_role;

-- Estado para la app: "activa" solo mientras el mes pagado esté vigente.
create or replace function public.mi_suscripcion() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.suscripciones;
begin
  if auth.uid() is null then return null; end if;
  select * into s from public.suscripciones where user_id = auth.uid();
  if not found then
    insert into public.suscripciones (user_id) values (auth.uid())
    on conflict (user_id) do nothing;
    select * into s from public.suscripciones where user_id = auth.uid();
  end if;
  return jsonb_build_object(
    'estado', case when s.gratis then 'gratis'
                   when s.pagado_hasta > now() then 'activa'
                   else 'prueba' end,
    'prueba_hasta', s.prueba_hasta,
    'pagado_hasta', s.pagado_hasta,
    'acceso', public.tiene_acceso(s.user_id),
    'codigo_invitacion', s.codigo_invitacion,
    'dias_bonus', s.dias_bonus,
    'con_flow', false,
    'sincronizado_at', s.sincronizado_at
  );
end $$;
revoke all on function public.mi_suscripcion() from public, anon;
grant execute on function public.mi_suscripcion() to authenticated;
