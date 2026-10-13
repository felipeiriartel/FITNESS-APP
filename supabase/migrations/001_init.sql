-- =====================================================================
-- Balance · Esquema inicial
-- Seguimiento de calorías, macros, agua, ejercicio, peso y cintura.
-- Multiusuario: cada persona solo ve y modifica sus propios datos (RLS).
-- =====================================================================

-- ---------- Perfil ----------
create table if not exists public.profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  display_name       text,
  sex                text not null check (sex in ('M','F')),
  birth_date         date not null,
  height_cm          numeric(5,1) not null check (height_cm between 100 and 250),
  activity_level     text not null default 'sedentaria'
                     check (activity_level in ('sedentaria','ligera','activa')),
  goal_rate_kg_week  numeric(3,2) not null default 0.50 check (goal_rate_kg_week between 0 and 1),
  protein_g_per_kg   numeric(3,1) not null default 1.7 check (protein_g_per_kg between 0.8 and 3.0),
  usual_exercise_hours_week numeric(4,1) not null default 0 check (usual_exercise_hours_week between 0 and 40),
  target_mode        text not null default 'auto' check (target_mode in ('auto','manual')),
  manual_target_kcal integer check (manual_target_kcal between 1000 and 6000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------- Peso y cintura ----------
create table if not exists public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_date   date not null,
  weight_kg  numeric(5,2) not null check (weight_kg between 25 and 400),
  waist_cm   numeric(5,1) check (waist_cm between 40 and 250),
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

-- ---------- Comidas y bebidas ----------
create table if not exists public.meals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  log_date      date not null,
  meal_type     text not null
                check (meal_type in ('desayuno','almuerzo','once','cena','colacion','bebida')),
  description   text not null,
  kcal          integer not null check (kcal >= 0),
  protein_g     numeric(6,1) not null default 0,
  carbs_g       numeric(6,1) not null default 0,
  fat_g         numeric(6,1) not null default 0,
  items         jsonb not null default '[]'::jsonb,
  ai_confidence numeric(3,2),
  source        text not null default 'manual' check (source in ('ia','manual','favorita')),
  photo_path    text,
  created_at    timestamptz not null default now()
);

-- ---------- Comidas frecuentes ----------
create table if not exists public.favorite_meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  meal_type  text not null default 'almuerzo',
  kcal       integer not null check (kcal >= 0),
  protein_g  numeric(6,1) not null default 0,
  carbs_g    numeric(6,1) not null default 0,
  fat_g      numeric(6,1) not null default 0,
  items      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Ejercicio ----------
create table if not exists public.exercise_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  log_date      date not null,
  exercise_type text not null,
  description   text,
  duration_min  integer not null check (duration_min between 1 and 600),
  intensity     text not null default 'moderada' check (intensity in ('baja','moderada','alta')),
  kcal_est      integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ---------- Agua ----------
create table if not exists public.water_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_date   date not null,
  ml         integer not null check (ml between 1 and 5000),
  created_at timestamptz not null default now()
);

-- ---------- Índices ----------
create index if not exists meals_user_date_idx     on public.meals (user_id, log_date);
create index if not exists exercise_user_date_idx  on public.exercise_logs (user_id, log_date);
create index if not exists water_user_date_idx     on public.water_logs (user_id, log_date);
create index if not exists favorites_user_idx      on public.favorite_meals (user_id);

-- ---------- updated_at automático ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- Seguridad a nivel de fila ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','weight_logs','meals','favorite_meals','exercise_logs','water_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "propios_datos" on public.%I', t);
    execute format(
      'create policy "propios_datos" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- ---------- Almacenamiento de fotos (privado, carpeta por usuario) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "fotos_leer_propias"    on storage.objects;
drop policy if exists "fotos_subir_propias"   on storage.objects;
drop policy if exists "fotos_borrar_propias"  on storage.objects;

create policy "fotos_leer_propias" on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "fotos_subir_propias" on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "fotos_borrar_propias" on storage.objects for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
