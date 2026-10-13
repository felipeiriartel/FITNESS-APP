-- Comidia · Las fotos solo se conservan en las comidas frecuentes
alter table public.favorite_meals add column if not exists photo_path text;
