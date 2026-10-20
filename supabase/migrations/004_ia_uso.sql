-- Comidia · Registro de cada llamada a la IA (función analyze-meal).
-- Lo escribe solo la función con la clave de servicio; cada usuario puede ver sus propias filas.
create table if not exists public.ia_uso (
  id             bigint generated always as identity primary key,
  user_id        uuid references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  modo           text not null,              -- analizar | sugerir
  foto           boolean not null default false,
  proveedor      text,
  modelo         text,
  intentos       smallint not null default 1,
  tokens_entrada integer not null default 0,
  tokens_salida  integer not null default 0,
  ok             boolean not null,
  error          text
);
create index if not exists ia_uso_user_fecha on public.ia_uso (user_id, created_at desc);

alter table public.ia_uso enable row level security;
drop policy if exists "ia_uso_ver_propios" on public.ia_uso;
create policy "ia_uso_ver_propios" on public.ia_uso for select to authenticated
  using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.ia_uso from anon, authenticated;
