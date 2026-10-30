-- Comidia · Objetivos: bajar de peso, mantener, ganar músculo o subir de peso.
-- La proteína pasa a calcularse sola según el objetivo (proteina_auto), con la opción de fijarla a mano.

alter table public.profiles
  add column if not exists objetivo text not null default 'bajar'
    check (objetivo in ('bajar', 'mantener', 'musculo', 'subir'));

-- Proteína automática según el objetivo; si la persona la fija a mano, se usa protein_g_per_kg.
alter table public.profiles add column if not exists proteina_auto boolean not null default true;

-- Quienes tenían ritmo 0 querían mantener su peso.
update public.profiles set objetivo = 'mantener' where goal_rate_kg_week = 0 and objetivo = 'bajar';

-- Ranking: el color del día depende del objetivo de cada persona (mismos umbrales que estadoDia()).
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
        when x.obj = 'bajar' then
          case when d.kcal < x.meta * 0.6 then 'bajo'
               when d.kcal <= x.meta then 'ok'
               when d.kcal <= x.meta * 1.1 then 'leve'
               else 'exceso' end
        else
          case when d.kcal < x.meta * 0.8 then 'bajo'
               when d.kcal > x.meta * 1.2 then 'exceso'
               when d.kcal between x.meta * 0.9 and x.meta * 1.1 then 'ok'
               else 'leve' end
      end as estado
    from dias d
    join profiles pr on pr.user_id = d.user_id
    cross join lateral (
      select nullif((pr.metas_cache->>'meta')::numeric, 0) as meta,
             coalesce(pr.metas_cache->>'objetivo', pr.objetivo, 'bajar') as obj
    ) x
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
