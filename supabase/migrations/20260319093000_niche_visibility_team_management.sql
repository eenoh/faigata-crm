-- Niche visibility and team-based selection model
-- Canonical catalog remains in public.niches.
-- Team-enabled dropdown options are sourced from public.team_niches.

alter table if exists public.niches
  add column if not exists visibility text;

update public.niches
set visibility = case
  when scope = 'global' and organization_id is null then 'public'
  else coalesce(visibility, 'private')
end
where visibility is null;

alter table if exists public.niches
  alter column visibility set not null;

alter table if exists public.niches
  drop constraint if exists niches_visibility_check;

alter table if exists public.niches
  add constraint niches_visibility_check
  check (visibility in ('private', 'public'));

create index if not exists niches_scope_visibility_idx
  on public.niches (scope, visibility);

create index if not exists niches_org_scope_visibility_idx
  on public.niches (organization_id, scope, visibility);

create unique index if not exists niches_normalized_name_scope_org_uidx
  on public.niches (normalized_name, scope, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'));

create unique index if not exists team_niches_team_id_niche_id_uidx
  on public.team_niches (team_id, niche_id);

create index if not exists team_niches_team_id_idx
  on public.team_niches (team_id);

create index if not exists leads_niche_id_idx
  on public.leads (niche_id);

alter table if exists public.leads
  drop constraint if exists leads_niche_id_fkey;

alter table if exists public.leads
  add constraint leads_niche_id_fkey
  foreign key (niche_id) references public.niches(id)
  on delete set null;
