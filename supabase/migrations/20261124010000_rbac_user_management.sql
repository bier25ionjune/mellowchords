-- =============================================================================
-- mellowchords: Role-Based Access Control (RBAC) & Admin User Management
-- =============================================================================
-- Idempotent migration extending public.profiles with `role` ('admin' | 'user')
-- and `is_active` (boolean), keeping full backward compatibility with `is_admin`
-- and `status` ('pending' | 'approved' | 'rejected').
-- =============================================================================

-- 1) Ensure base profiles table exists & add RBAC columns ---------------------
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

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profiles_role_check'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('admin', 'user'));
  end if;
end $$;

create index if not exists profiles_status_created_idx
  on public.profiles (status, created_at);

create index if not exists profiles_role_active_idx
  on public.profiles (role, is_active, created_at desc);

alter table public.profiles enable row level security;

-- 2) Backfill existing rows & sync role <-> is_admin --------------------------
insert into public.profiles (id, email, username, status, role, is_admin, is_active, approved_at)
select
  id,
  coalesce(email, ''),
  split_part(coalesce(email, ''), '@', 1),
  'approved',
  case when lower(coalesce(email, '')) = 'bierbebad@mellowchords.local' then 'admin' else 'user' end,
  lower(coalesce(email, '')) = 'bierbebad@mellowchords.local',
  true,
  now()
from auth.users
on conflict (id) do nothing;

update public.profiles
   set role = 'admin',
       is_admin = true,
       is_active = true,
       status = 'approved',
       approved_at = coalesce(approved_at, now())
 where lower(email) = 'bierbebad@mellowchords.local';

update public.profiles
   set role = case when is_admin then 'admin' else 'user' end
 where role is distinct from (case when is_admin then 'admin' else 'user' end);

-- 3) Trigger to keep role <-> is_admin synced & prevent admin self-lockout ----
create or replace function public.sync_profile_rbac_fields()
returns trigger
language plpgsql
security definer
set search_path = public as
$$
begin
  if tg_op = 'INSERT' then
    if new.role = 'admin' then
      new.is_admin := true;
    elsif new.is_admin = true then
      new.role := 'admin';
    else
      new.role := 'user';
      new.is_admin := false;
    end if;
    new.is_active := coalesce(new.is_active, true);
    new.updated_at := coalesce(new.updated_at, now());
    return new;
  end if;

  -- Prevent authenticated admin from locking out their own account
  if auth.uid() is not null and old.id = auth.uid() then
    if old.role = 'admin' and new.role is distinct from 'admin' then
      raise exception 'Cannot demote your own admin role';
    end if;
    if old.is_admin = true and new.is_admin is distinct from true and new.role is not distinct from old.role then
      raise exception 'Cannot demote your own admin role';
    end if;
    if old.is_active = true and new.is_active is distinct from true then
      raise exception 'Cannot deactivate your own account';
    end if;
    if old.status = 'approved' and new.status is distinct from 'approved' then
      raise exception 'Cannot revoke approval on your own account';
    end if;
  end if;

  -- Bi-directional sync between `role` and legacy `is_admin`
  if new.role is distinct from old.role then
    new.is_admin := (new.role = 'admin');
  elsif new.is_admin is distinct from old.is_admin then
    new.role := case when new.is_admin then 'admin' else 'user' end;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_rbac on public.profiles;
create trigger trg_profiles_sync_rbac
  before insert or update on public.profiles
  for each row execute function public.sync_profile_rbac_fields();

-- 4) Update new-user signup trigger -------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public as
$$
declare
  adm boolean := lower(coalesce(new.email, '')) = 'bierbebad@mellowchords.local';
begin
  insert into public.profiles (id, email, username, status, role, is_admin, is_active, approved_at)
  values (
    new.id,
    coalesce(new.email, ''),
    split_part(coalesce(new.email, ''), '@', 1),
    case when adm then 'approved' else 'pending' end,
    case when adm then 'admin' else 'user' end,
    adm,
    true,
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

-- 5) RBAC & Approval Helper Functions (SECURITY DEFINER avoids RLS recursion) -
create or replace function public.is_user_active()
returns boolean
language sql
stable
security definer
set search_path = public as
$$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public as
$$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role = 'admin' or is_admin = true)
      and is_active = true
      and status = 'approved'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public as
$$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'approved'
      and is_active = true
  );
$$;

grant execute on function public.is_user_active() to authenticated;
grant execute on function public.is_admin()       to authenticated;
grant execute on function public.is_approved()    to authenticated;

-- 6) Profiles RLS Policies & Column-Level Grants ------------------------------
drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke update on public.profiles from authenticated;
grant update (status, approved_at, approved_by, role, is_admin, is_active, updated_at)
  on public.profiles to authenticated;

-- 7) Gate data tables & storage (inactive or unapproved users blocked) --------
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

drop policy if exists "require approved user chord-images" on storage.objects;
create policy "require approved user chord-images" on storage.objects as restrictive
  for all to authenticated
  using (bucket_id <> 'chord-images' or public.is_approved())
  with check (bucket_id <> 'chord-images' or public.is_approved());
