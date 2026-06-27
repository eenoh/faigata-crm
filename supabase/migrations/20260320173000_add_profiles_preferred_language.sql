alter table public.profiles
add column if not exists preferred_language text default 'en';
