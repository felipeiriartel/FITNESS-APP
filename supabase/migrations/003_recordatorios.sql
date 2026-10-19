-- =====================================================================
-- Comidia · Recordatorios (notificaciones push)
-- Las claves VAPID y el token del cron NO están en este archivo: se crean
-- aparte en Supabase Vault (ver README, sección Recordatorios).
-- =====================================================================

-- Suscripciones push de cada teléfono o navegador.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "propios_datos" on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Preferencias de recordatorios, zona horaria y metas vigentes (las calcula la app).
alter table public.profiles
  add column if not exists recordatorios jsonb not null
    default '{"activo": false, "agua": ["11:00", "16:00"], "calorias": "20:00"}'::jsonb,
  add column if not exists zona_horaria text not null default 'America/Santiago',
  add column if not exists metas_cache jsonb;

-- Lectura de secretos de Vault, solo para el rol de servicio (funciones del servidor).
create or replace function public.secreto_app(nombre text) returns text
language sql security definer set search_path = '' stable as $$
  select decrypted_secret from vault.decrypted_secrets where name = nombre limit 1;
$$;
revoke all on function public.secreto_app(text) from public, anon, authenticated;
grant execute on function public.secreto_app(text) to service_role;

-- Programación: cada 15 minutos se llama a la función send-reminders.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
