-- Comidia · Amigos, comidas compartidas y suscripción.
--  1. Amistades: solicitud dentro de la app (buscar por nombre) o por enlace de invitación.
--  2. El ranking muestra solo a la persona y a sus amigos.
--  3. Comidas compartidas: quien registra una comida se la envía a uno o más amigos; cada uno la confirma o la rechaza.
--  4. Suscripción: 10 días de prueba sin tarjeta (15 si llega invitado), luego $4.990 al mes con Flow.
--     Quien invita suma 5 días de prueba por cada amigo que se registra (máximo 30 días extra).

-- ======================================================================
-- 1. Amistades
-- ======================================================================
create table if not exists public.amistades (
  id           uuid primary key default gen_random_uuid(),
  solicitante  uuid not null references auth.users(id) on delete cascade,
  destinatario uuid not null references auth.users(id) on delete cascade,
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'aceptada')),
  created_at   timestamptz not null default now(),
  aceptada_at  timestamptz,
  check (solicitante <> destinatario)
);
create unique index if not exists amistades_par
  on public.amistades (least(solicitante, destinatario), greatest(solicitante, destinatario));
create index if not exists amistades_destinatario on public.amistades (destinatario);

alter table public.amistades enable row level security;
drop policy if exists "amistades_ver_propias" on public.amistades;
create policy "amistades_ver_propias" on public.amistades for select to authenticated
  using ((select auth.uid()) in (solicitante, destinatario));
-- Se crean, aceptan y eliminan solo con las funciones de abajo.
revoke insert, update, delete on public.amistades from anon, authenticated;

create or replace function public.son_amigos(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.amistades
    where estado = 'aceptada'
      and least(solicitante, destinatario) = least(a, b)
      and greatest(solicitante, destinatario) = greatest(a, b)
  );
$$;
revoke all on function public.son_amigos(uuid, uuid) from public, anon;
grant execute on function public.son_amigos(uuid, uuid) to authenticated;

-- Lista de amigos y solicitudes: relacion = amigo | recibida | enviada
create or replace function public.mis_amigos()
returns table (solicitud_id uuid, user_id uuid, nombre text, relacion text)
language sql stable security definer set search_path = '' as $$
  select a.id,
    o.user_id,
    coalesce(nullif(trim(o.display_name), ''), 'Sin nombre'),
    case when a.estado = 'aceptada' then 'amigo'
         when a.destinatario = auth.uid() then 'recibida'
         else 'enviada' end
  from public.amistades a
  join public.profiles o
    on o.user_id = case when a.solicitante = auth.uid() then a.destinatario else a.solicitante end
  where auth.uid() in (a.solicitante, a.destinatario)
  order by 4 desc, 3;
$$;

-- Busca personas por nombre (mínimo 2 letras). Solo devuelve nombre y la relación actual.
create or replace function public.buscar_personas(q text)
returns table (user_id uuid, nombre text, relacion text)
language sql stable security definer set search_path = '' as $$
  select p.user_id,
    coalesce(nullif(trim(p.display_name), ''), 'Sin nombre'),
    case when a.id is null then 'ninguna'
         when a.estado = 'aceptada' then 'amigo'
         when a.destinatario = auth.uid() then 'recibida'
         else 'enviada' end
  from public.profiles p
  left join public.amistades a
    on least(a.solicitante, a.destinatario) = least(p.user_id, auth.uid())
   and greatest(a.solicitante, a.destinatario) = greatest(p.user_id, auth.uid())
  where auth.uid() is not null
    and p.user_id <> auth.uid()
    and length(trim(q)) >= 2
    and p.display_name ilike '%' || replace(replace(trim(q), '%', ''), '_', '') || '%'
  order by p.display_name
  limit 15;
$$;

-- Envía una solicitud. Si la otra persona ya le había enviado una, queda aceptada.
create or replace function public.solicitar_amistad(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  yo uuid := auth.uid();
  fila public.amistades;
begin
  if yo is null or p_user is null or p_user = yo then
    raise exception 'Solicitud no válida.';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then
    raise exception 'Esa persona no existe.';
  end if;
  select * into fila from public.amistades
  where least(solicitante, destinatario) = least(yo, p_user)
    and greatest(solicitante, destinatario) = greatest(yo, p_user);
  if found then
    if fila.estado = 'aceptada' then return 'amigo'; end if;
    if fila.destinatario = yo then
      update public.amistades set estado = 'aceptada', aceptada_at = now() where id = fila.id;
      return 'amigo';
    end if;
    return 'enviada';
  end if;
  insert into public.amistades (solicitante, destinatario) values (yo, p_user);
  return 'enviada';
end $$;

-- Acepta o rechaza una solicitud recibida.
create or replace function public.responder_amistad(p_id uuid, p_aceptar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_aceptar then
    update public.amistades set estado = 'aceptada', aceptada_at = now()
    where id = p_id and destinatario = auth.uid() and estado = 'pendiente';
  else
    delete from public.amistades where id = p_id and destinatario = auth.uid() and estado = 'pendiente';
  end if;
end $$;

-- Elimina una amistad o cancela una solicitud enviada.
create or replace function public.eliminar_amistad(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.amistades
  where least(solicitante, destinatario) = least(auth.uid(), p_user)
    and greatest(solicitante, destinatario) = greatest(auth.uid(), p_user);
$$;

revoke all on function public.mis_amigos() from public, anon;
revoke all on function public.buscar_personas(text) from public, anon;
revoke all on function public.solicitar_amistad(uuid) from public, anon;
revoke all on function public.responder_amistad(uuid, boolean) from public, anon;
revoke all on function public.eliminar_amistad(uuid) from public, anon;
grant execute on function public.mis_amigos() to authenticated;
grant execute on function public.buscar_personas(text) to authenticated;
grant execute on function public.solicitar_amistad(uuid) to authenticated;
grant execute on function public.responder_amistad(uuid, boolean) to authenticated;
grant execute on function public.eliminar_amistad(uuid) to authenticated;

-- ======================================================================
-- 2. Ranking solo entre amigos (misma fórmula que 005_ranking.sql)
-- ======================================================================
create or replace function public.ranking_mes(p_mes date default null)
returns table (posicion int, nombre text, puntos int, verdes int, amarillos int, dias int, es_yo boolean)
language sql stable security definer set search_path = public
as $$
  with params as (
    select date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Santiago')::date))::date as ini
  ),
  grupo as (
    select auth.uid() as user_id
    union
    select case when a.solicitante = auth.uid() then a.destinatario else a.solicitante end
    from amistades a
    where a.estado = 'aceptada' and auth.uid() in (a.solicitante, a.destinatario)
  ),
  dias as (
    select m.user_id, m.log_date, sum(m.kcal) as kcal
    from meals m, params p
    where m.user_id in (select user_id from grupo)
      and m.log_date >= p.ini and m.log_date < (p.ini + interval '1 month')::date
      and m.log_date <= (now() at time zone 'America/Santiago')::date
    group by m.user_id, m.log_date
  ),
  estados as (
    select d.user_id, d.log_date,
      case
        when d.kcal <= 0 then 'sin'
        when d.kcal < x.meta * 0.6 then 'bajo'
        when d.kcal <= x.meta then 'ok'
        when d.kcal <= x.meta * 1.1 then 'leve'
        else 'exceso'
      end as estado
    from dias d
    join profiles pr on pr.user_id = d.user_id
    cross join lateral (select nullif((pr.metas_cache->>'meta')::numeric, 0) as meta) x
    where x.meta is not null
  ),
  totales as (
    select pr.user_id,
      coalesce(nullif(trim(pr.display_name), ''), 'Sin nombre') as nombre,
      coalesce(sum(case e.estado when 'ok' then 2 when 'leve' then 1 else 0 end), 0)::int as puntos,
      (count(*) filter (where e.estado = 'ok'))::int as verdes,
      (count(*) filter (where e.estado = 'leve'))::int as amarillos,
      count(e.log_date)::int as dias
    from profiles pr
    left join estados e on e.user_id = pr.user_id
    where pr.metas_cache is not null and pr.user_id in (select user_id from grupo)
    group by pr.user_id, pr.display_name
  )
  select (rank() over (order by t.puntos desc, t.verdes desc))::int, t.nombre, t.puntos, t.verdes, t.amarillos, t.dias,
    t.user_id = auth.uid()
  from totales t
  where auth.uid() is not null
  order by t.puntos desc, t.verdes desc, t.nombre;
$$;

-- ======================================================================
-- 3. Comidas compartidas
-- ======================================================================
create table if not exists public.comidas_compartidas (
  id            uuid primary key default gen_random_uuid(),
  de_user       uuid not null references auth.users(id) on delete cascade,
  para_user     uuid not null references auth.users(id) on delete cascade,
  log_date      date not null,
  meal_type     text not null check (meal_type in ('desayuno','almuerzo','once','cena','colacion','bebida')),
  description   text not null,
  kcal          integer not null check (kcal >= 0),
  protein_g     numeric(6,1) not null default 0,
  carbs_g       numeric(6,1) not null default 0,
  fat_g         numeric(6,1) not null default 0,
  items         jsonb not null default '[]'::jsonb,
  estado        text not null default 'pendiente' check (estado in ('pendiente','aceptada','rechazada')),
  created_at    timestamptz not null default now(),
  respondida_at timestamptz,
  check (de_user <> para_user)
);
create index if not exists compartidas_para on public.comidas_compartidas (para_user, estado, created_at desc);

alter table public.comidas_compartidas enable row level security;
drop policy if exists "compartidas_ver" on public.comidas_compartidas;
drop policy if exists "compartidas_enviar" on public.comidas_compartidas;
drop policy if exists "compartidas_responder" on public.comidas_compartidas;
drop policy if exists "compartidas_retirar" on public.comidas_compartidas;
create policy "compartidas_ver" on public.comidas_compartidas for select to authenticated
  using ((select auth.uid()) in (de_user, para_user));
-- Solo se puede enviar a amigos.
create policy "compartidas_enviar" on public.comidas_compartidas for insert to authenticated
  with check ((select auth.uid()) = de_user and estado = 'pendiente' and public.son_amigos(de_user, para_user));
-- Quien la recibe solo cambia el estado.
create policy "compartidas_responder" on public.comidas_compartidas for update to authenticated
  using ((select auth.uid()) = para_user and estado = 'pendiente')
  with check ((select auth.uid()) = para_user and estado in ('aceptada','rechazada'));
-- Quien la envió puede retirarla mientras esté pendiente.
create policy "compartidas_retirar" on public.comidas_compartidas for delete to authenticated
  using ((select auth.uid()) = de_user and estado = 'pendiente');
revoke update on public.comidas_compartidas from authenticated;
grant update (estado, respondida_at) on public.comidas_compartidas to authenticated;

-- Comidas pendientes que le compartieron, con el nombre de quien la envió.
create or replace function public.comidas_recibidas()
returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) || jsonb_build_object('de_nombre', coalesce(nullif(trim(p.display_name), ''), 'Un amigo'))
  from public.comidas_compartidas c
  left join public.profiles p on p.user_id = c.de_user
  where c.para_user = auth.uid() and c.estado = 'pendiente'
    and c.created_at > now() - interval '14 days'
  order by c.created_at desc;
$$;
revoke all on function public.comidas_recibidas() from public, anon;
grant execute on function public.comidas_recibidas() to authenticated;

-- ======================================================================
-- 4. Suscripción
-- ======================================================================
create table if not exists public.suscripciones (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  prueba_hasta         timestamptz not null default now() + interval '10 days',
  gratis               boolean not null default false,
  -- Copia del estado en Flow (la escribe solo el servidor): prueba | activa | morosa | cancelada
  estado               text not null default 'prueba' check (estado in ('prueba','activa','morosa','cancelada')),
  pagado_hasta         timestamptz,
  flow_customer_id     text,
  flow_subscription_id text,
  codigo_invitacion    text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7)),
  invitado_por         uuid references auth.users(id) on delete set null,
  bonus_entregado      boolean not null default false,
  dias_bonus           integer not null default 0,
  sincronizado_at      timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
drop trigger if exists suscripciones_updated_at on public.suscripciones;
create trigger suscripciones_updated_at before update on public.suscripciones
  for each row execute function public.set_updated_at();

alter table public.suscripciones enable row level security;
drop policy if exists "suscripcion_ver_propia" on public.suscripciones;
create policy "suscripcion_ver_propia" on public.suscripciones for select to authenticated
  using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.suscripciones from anon, authenticated;

create or replace function public.tiene_acceso(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select s.gratis
        or s.prueba_hasta > now()
        or s.estado = 'activa'
        or (s.estado = 'cancelada' and s.pagado_hasta > now())
    from public.suscripciones s where s.user_id = p_user
  ), true);  -- sin fila (cuenta antigua sin migrar): no se bloquea
$$;
revoke all on function public.tiene_acceso(uuid) from public, anon, authenticated;
grant execute on function public.tiene_acceso(uuid) to service_role;

-- Estado de la suscripción para la app.
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
    'estado', case when s.gratis then 'gratis' else s.estado end,
    'prueba_hasta', s.prueba_hasta,
    'pagado_hasta', s.pagado_hasta,
    'acceso', public.tiene_acceso(s.user_id),
    'codigo_invitacion', s.codigo_invitacion,
    'dias_bonus', s.dias_bonus,
    'con_flow', s.flow_subscription_id is not null,
    'sincronizado_at', s.sincronizado_at
  );
end $$;
revoke all on function public.mi_suscripcion() from public, anon;
grant execute on function public.mi_suscripcion() to authenticated;

-- Al crear la cuenta: 10 días de prueba, o 15 si llegó con un código de invitación válido.
create or replace function public.nueva_suscripcion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare anfitrion uuid;
begin
  select user_id into anfitrion from public.suscripciones
  where codigo_invitacion = upper(trim(coalesce(new.raw_user_meta_data->>'invita', '')))
    and user_id <> new.id;
  insert into public.suscripciones (user_id, prueba_hasta, invitado_por)
  values (new.id, now() + case when anfitrion is null then interval '10 days' else interval '15 days' end, anfitrion)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists auth_nueva_suscripcion on auth.users;
create trigger auth_nueva_suscripcion after insert on auth.users
  for each row execute function public.nueva_suscripcion();

-- Cuando el invitado completa su perfil: +5 días a quien lo invitó (máx. 30) y quedan como amigos.
create or replace function public.premiar_invitacion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.suscripciones;
begin
  select * into s from public.suscripciones where user_id = new.user_id;
  if not found or s.invitado_por is null or s.bonus_entregado then return new; end if;
  update public.suscripciones set bonus_entregado = true where user_id = new.user_id;
  update public.suscripciones
    set prueba_hasta = greatest(prueba_hasta, now()) + interval '5 days', dias_bonus = dias_bonus + 5
    where user_id = s.invitado_por and dias_bonus < 30 and not gratis;
  insert into public.amistades (solicitante, destinatario, estado, aceptada_at)
  values (s.invitado_por, new.user_id, 'aceptada', now())
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists profiles_premiar_invitacion on public.profiles;
create trigger profiles_premiar_invitacion after insert on public.profiles
  for each row execute function public.premiar_invitacion();

revoke all on function public.nueva_suscripcion() from public, anon, authenticated;
revoke all on function public.premiar_invitacion() from public, anon, authenticated;

-- ======================================================================
-- 5. Datos actuales
-- ======================================================================
-- Todas las cuentas existentes parten su prueba de 10 días hoy.
insert into public.suscripciones (user_id, prueba_hasta)
select id, now() + interval '10 days' from auth.users
on conflict (user_id) do nothing;

-- Cuentas gratis: Felipe, Alonso, Ignacia, Simón y Franklin.
update public.suscripciones s set gratis = true
from auth.users u
where u.id = s.user_id
  and lower(u.email) in ('borussi20131013@gmail.com', 'alonsirifc2020@gmail.com',
                         'ignaciaolivaresss1@gmail.com', 'simonaraya2@gmail.com',
                         'frankliniriarte@gmail.com');

-- El grupo que ya competía queda como amigos entre sí, para que el ranking no se vacíe.
insert into public.amistades (solicitante, destinatario, estado, aceptada_at)
select a.user_id, b.user_id, 'aceptada', now()
from public.profiles a
join public.profiles b on a.user_id < b.user_id
join auth.users ua on ua.id = a.user_id
join auth.users ub on ub.id = b.user_id
where a.created_at < '2026-10-30' and b.created_at < '2026-10-30'
on conflict do nothing;
