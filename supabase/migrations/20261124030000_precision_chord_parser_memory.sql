-- =============================================================================
-- mellowchords: Precision Chord Parser (ChordPro) + Dynamic Learning Memory
-- =============================================================================
-- Idempotent migration:
--   1. Adds ChordPro & verification columns to public.songs:
--      original_key, chordpro_content, source_domain, is_verified
--   2. Creates public.chord_parser_memory for storing OCR/alignment correction
--      rules and high-quality verified ChordPro few-shot examples per source_domain
--   3. Enforces RBAC (restrictive public.is_approved() policy + RLS)
--   4. Auto-prunes memory to keep top 10 highest-quality latest entries per
--      (source_domain, entry_type)
-- =============================================================================

-- 1) Extend public.songs with standardized ChordPro fields --------------------
do $$
begin
  if to_regclass('public.songs') is not null then
    alter table public.songs
      add column if not exists original_key     text not null default '',
      add column if not exists chordpro_content text not null default '',
      add column if not exists source_domain    text not null default 'unknown',
      add column if not exists is_verified      boolean not null default false;

    create index if not exists songs_source_verified_idx
      on public.songs (source_domain, is_verified);
  end if;
end $$;

-- 2) Create public.chord_parser_memory ----------------------------------------
create table if not exists public.chord_parser_memory (
  id                uuid primary key default gen_random_uuid(),
  source_domain     text not null default 'chordtabs'
                    check (length(trim(source_domain)) between 1 and 80),
  entry_type        text not null
                    check (entry_type in ('few_shot_example', 'correction_rule')),
  song_id           text,
  song_title        text not null default '',
  original_key      text not null default '',
  raw_ai_output     text not null default '',
  verified_chordpro text not null default '',
  correction_rules  jsonb not null default '[]'::jsonb,
  quality_score     integer not null default 100
                    check (quality_score between 0 and 100),
  usage_count       integer not null default 0 check (usage_count >= 0),
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists chord_parser_memory_lookup_idx
  on public.chord_parser_memory (source_domain, entry_type, quality_score desc, updated_at desc);

create index if not exists chord_parser_memory_song_idx
  on public.chord_parser_memory (song_id);

alter table public.chord_parser_memory enable row level security;

-- Shared updated_at trigger (safe if already defined in previous migration)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql as
$$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_chord_parser_memory_updated_at on public.chord_parser_memory;
create trigger trg_chord_parser_memory_updated_at
  before update on public.chord_parser_memory
  for each row execute function public.touch_updated_at();

-- 3) RLS & Restrictive Approval Gate ------------------------------------------
drop policy if exists "require approved user parser memory" on public.chord_parser_memory;
create policy "require approved user parser memory" on public.chord_parser_memory
  as restrictive
  for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

drop policy if exists "approved read parser memory" on public.chord_parser_memory;
create policy "approved read parser memory" on public.chord_parser_memory
  for select to authenticated
  using (true);

drop policy if exists "approved insert parser memory" on public.chord_parser_memory;
create policy "approved insert parser memory" on public.chord_parser_memory
  for insert to authenticated
  with check (created_by is null or auth.uid() = created_by);

drop policy if exists "approved update own or admin parser memory" on public.chord_parser_memory;
create policy "approved update own or admin parser memory" on public.chord_parser_memory
  for update to authenticated
  using (auth.uid() = created_by or public.is_admin())
  with check (auth.uid() = created_by or public.is_admin());

drop policy if exists "approved delete own or admin parser memory" on public.chord_parser_memory;
create policy "approved delete own or admin parser memory" on public.chord_parser_memory
  for delete to authenticated
  using (auth.uid() = created_by or public.is_admin());

grant select, insert, update, delete on public.chord_parser_memory to authenticated;

-- 4) Auto-Pruning Trigger (keep top 10 per source_domain + entry_type) --------
create or replace function public.prune_chord_parser_memory()
returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  delete from public.chord_parser_memory
  where id in (
    select id
    from public.chord_parser_memory
    where source_domain = new.source_domain
      and entry_type = new.entry_type
    order by quality_score desc, updated_at desc
    offset 10
  );
  return new;
end;
$$;

drop trigger if exists trg_prune_chord_parser_memory on public.chord_parser_memory;
create trigger trg_prune_chord_parser_memory
  after insert or update on public.chord_parser_memory
  for each row execute function public.prune_chord_parser_memory();

-- 5) Allow +/- 12 semitones transpose in public.live_rooms --------------------
do $$
begin
  if to_regclass('public.live_rooms') is not null then
    alter table public.live_rooms
      drop constraint if exists live_rooms_current_key_shift_check;
    alter table public.live_rooms
      add constraint live_rooms_current_key_shift_check
      check (current_key_shift between -12 and 12);
  end if;
end $$;
