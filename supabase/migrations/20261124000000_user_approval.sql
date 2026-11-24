-- =============================================================================
-- mellowchords: user approval system
-- =============================================================================
-- *** NOT APPLIED. Review, test on a Supabase branch/staging project first, then
-- *** run it deliberately in the SQL editor of the production project.
-- Idempotent: safe to re-run.
--
-- Model
--   * public.profiles: one row per auth user with status pending|approved|rejected.
--   * Only bierbebad@mellowchords.local is auto-approved + admin on signup.
--     !! Register the `bierbebad` account BEFORE publishing the new client
--        (otherwise somebody else could squat the name — the trigger keys on the
--        exact email, so register it first, or it is the only one auto-approved).
--   * Every existing user is backfilled as 'approved' so nobody is locked out.
--   * Users cannot change their own status / is_admin (no UPDATE policy for them).
--   * Data tables are gated with RESTRICTIVE policies (see section 5).
--
-- The client degrades gracefully if this migration has NOT been applied
-- (profiles table missing => behaves as before, no approval screen).
-- =============================================================================

-- 1) profiles table ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  username    text,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);

create index if not exists profiles_status_created_idx
  on public.profiles (status, created_at);

alter table public.profiles enable row level security;

-- 2) helper functions (SECURITY DEFINER avoids RLS recursion on profiles) -------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin and status = 'approved'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

grant execute on function public.is_admin()    to authenticated;
grant execute on function public.is_approved() to authenticated;

-- 3) new-user trigger: pending, except bierbebad = approved admin ---------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as
$$
declare
  adm boolean := lower(coalesce(new.email, '')) = 'bierbebad@mellowchords.local';
begin
  insert into public.profiles (id, email, username, status, is_admin, approved_at)
  values (
    new.id,
    coalesce(new.email, ''),
    split_part(coalesce(new.email, ''), '@', 1),
    case when adm then 'approved' else 'pending' end,
    adm,
    case when adm then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) backfill: existing users stay approved; promote the admin ------------------
insert into public.profiles (id, email, username, status, approved_at)
select id, coalesce(email, ''), split_part(coalesce(email, ''), '@', 1), 'approved', now()
from auth.users
on conflict (id) do nothing;

update public.profiles
   set is_admin = true, status = 'approved', approved_at = coalesce(approved_at, now())
 where lower(email) = 'bierbebad@mellowchords.local';

-- profiles RLS
drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- No INSERT / DELETE policies: rows are created only by the trigger.

-- Defence in depth: even an admin may only touch status/approval columns.
revoke update on public.profiles from authenticated;
grant  update (status, approved_at, approved_by) on public.profiles to authenticated;

-- 5) gate data tables -----------------------------------------------------------
-- !!! CHECK AGAINST PRODUCTION BEFORE APPLYING !!!
-- The existing table/policy/bucket names are NOT in this repo. Inspect first (read-only):
--     select schemaname, tablename, policyname, permissive, cmd
--       from pg_policies where schemaname in ('public','storage') order by 1,2,3;
-- Table names used by the client: songs, playlists, playlist_items; storage bucket
-- 'chord-images'; public RPC get_shared_playlist (must stay callable w/o approval).
-- RESTRICTIVE policies are AND-ed with the existing (permissive) ones, so existing
-- policies need not be rewritten. Adjust names if prod differs.
do $$
begin
  if to_regclass('public.songs') is not null then
    execute 'drop policy if exists "require approved user" on public.songs';
    execute 'create policy "require approved user" on public.songs as restrictive
             for all to authenticated using (public.is_approved()) with check (public.is_approved())';
  end if;
  if to_regclass('public.playlists') is not null then
    execute 'drop policy if exists "require approved user" on public.playlists';
    execute 'create policy "require approved user" on public.playlists as restrictive
             for all to authenticated using (public.is_approved()) with check (public.is_approved())';
  end if;
  if to_regclass('public.playlist_items') is not null then
    execute 'drop policy if exists "require approved user" on public.playlist_items';
    execute 'create policy "require approved user" on public.playlist_items as restrictive
             for all to authenticated using (public.is_approved()) with check (public.is_approved())';
  end if;
end $$;

-- Storage bucket 'chord-images' (policy on storage.objects). Verify the bucket id first.
drop policy if exists "require approved user chord-images" on storage.objects;
create policy "require approved user chord-images" on storage.objects as restrictive
  for all to authenticated
  using (bucket_id <> 'chord-images' or public.is_approved())
  with check (bucket_id <> 'chord-images' or public.is_approved());
