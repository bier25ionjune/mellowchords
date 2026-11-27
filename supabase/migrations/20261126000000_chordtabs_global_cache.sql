-- =============================================================================
-- Mellow Chords — Shared Global Chordtabs Cache (DB-First Search)
-- Allows approved users to share fetched chordtabs.in.th metadata & image URLs
-- so repeated searches hit the database first before calling external web search.
-- =============================================================================

create table if not exists public.chordtabs_cache (
  id                uuid primary key default gen_random_uuid(),
  chordtabs_id      text not null unique,
  title             text not null,
  artist            text not null default '',
  original_key      text not null default '',
  source_url        text not null default '',
  image_url         text not null default '',
  chordpro_content  text not null default '',
  hit_count         integer not null default 1,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists chordtabs_cache_title_idx
  on public.chordtabs_cache using btree (lower(title));

create index if not exists chordtabs_cache_artist_idx
  on public.chordtabs_cache using btree (lower(artist));

create index if not exists chordtabs_cache_updated_idx
  on public.chordtabs_cache (updated_at desc);

alter table public.chordtabs_cache enable row level security;

-- Restrictive guard: only approved, active users can read/write global cache
drop policy if exists "require approved user" on public.chordtabs_cache;
create policy "require approved user" on public.chordtabs_cache as restrictive
  for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

drop policy if exists "chordtabs_cache select approved" on public.chordtabs_cache;
create policy "chordtabs_cache select approved" on public.chordtabs_cache
  for select to authenticated
  using (true);

drop policy if exists "chordtabs_cache insert approved" on public.chordtabs_cache;
create policy "chordtabs_cache insert approved" on public.chordtabs_cache
  for insert to authenticated
  with check (true);

drop policy if exists "chordtabs_cache update approved" on public.chordtabs_cache;
create policy "chordtabs_cache update approved" on public.chordtabs_cache
  for update to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.chordtabs_cache to authenticated;
