-- Comidia · Ranking mensual.
-- Puntos por día: verde (dentro de la meta) 2, amarillo (hasta 10% sobre la meta) 1, rojo o azul 0.
-- Mismos umbrales que estadoDia() en src/lib/calc.js, con la meta vigente de cada persona
-- (profiles.metas_cache, la misma que usa el calendario). El día de hoy suma en vivo.
-- Se calcula en la base de datos; cada persona ve solo nombres y puntos de los demás, nunca calorías ni peso.
create or replace function public.ranking_mes(p_mes date default null)
returns table (posicion int, nombre text, puntos int, verdes int, amarillos int, dias int, es_yo boolean)
language sql stable security definer set search_path = public
as $$
  with params as (
    select date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Santiago')::date))::date as ini
  ),
  dias as (
    select m.user_id, m.log_date, sum(m.kcal) as kcal
    from meals m, params p
    where m.log_date >= p.ini and m.log_date < (p.ini + interval '1 month')::date
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
    where pr.metas_cache is not null
    group by pr.user_id, pr.display_name
  )
  select (rank() over (order by t.puntos desc, t.verdes desc))::int, t.nombre, t.puntos, t.verdes, t.amarillos, t.dias,
    t.user_id = auth.uid()
  from totales t
  where auth.uid() is not null
  order by t.puntos desc, t.verdes desc, t.nombre;
$$;

revoke all on function public.ranking_mes(date) from public, anon;
grant execute on function public.ranking_mes(date) to authenticated;
