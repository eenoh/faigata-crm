create table if not exists public.custom_value_translation_sources (
  id text primary key,
  team_id uuid null,
  organization_id uuid null,
  entity_table text not null,
  entity_id text not null,
  field_key text not null,
  source_text text not null default '',
  source_locale text not null default 'en',
  source_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_value_translation_sources_entity_idx
  on public.custom_value_translation_sources (entity_table, entity_id);

create index if not exists custom_value_translation_sources_team_idx
  on public.custom_value_translation_sources (team_id);

create index if not exists custom_value_translation_sources_org_idx
  on public.custom_value_translation_sources (organization_id);

create table if not exists public.custom_value_translations (
  id text primary key,
  source_id text not null references public.custom_value_translation_sources(id) on delete cascade,
  locale text not null,
  translated_text text null,
  is_manual boolean not null default false,
  provider text null,
  source_hash_at_translation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_value_translations_source_locale_key unique (source_id, locale)
);

create index if not exists custom_value_translations_source_idx
  on public.custom_value_translations (source_id);

create index if not exists custom_value_translations_locale_idx
  on public.custom_value_translations (locale);
