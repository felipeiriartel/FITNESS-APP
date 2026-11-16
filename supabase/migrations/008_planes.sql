-- 008 · Planes de 1, 3 y 6 meses (pago único con Webpay vía Flow).
alter table public.pagos add column if not exists meses integer not null default 1;
alter table public.pagos drop constraint if exists pagos_meses_check;
alter table public.pagos add constraint pagos_meses_check check (meses in (1, 3, 6));

create or replace function public.registrar_pago(p_order text, p_flow_order bigint)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_meses integer; v_hasta timestamptz;
begin
  update public.pagos set estado = 'pagado', flow_order = p_flow_order, pagado_at = now()
  where commerce_order = p_order and estado <> 'pagado'
  returning user_id, meses into v_user, v_meses;
  if v_user is null then
    select periodo_hasta into v_hasta from public.pagos where commerce_order = p_order;
    return v_hasta;
  end if;
  update public.suscripciones
  set estado = 'activa',
      pagado_hasta = greatest(now(), prueba_hasta, coalesce(pagado_hasta, now())) + make_interval(months => v_meses)
  where user_id = v_user
  returning pagado_hasta into v_hasta;
  update public.pagos set periodo_hasta = v_hasta where commerce_order = p_order;
  return v_hasta;
end $$;
revoke all on function public.registrar_pago(text, bigint) from public, anon, authenticated;
grant execute on function public.registrar_pago(text, bigint) to service_role;
