-- =============================================================================
-- mellowchords: Friends, Band Groups & Real-time Live Room
-- =============================================================================
-- Idempotent migration creating:
--   1. public.friendships
--   2. public.band_groups
--   3. public.band_group_members
--   4. public.live_rooms
--   5. public.live_room_members
-- All tables enforce RLS + restrictive public.is_approved() gate (RBAC).
-- =============================================================================

-- 1) Friendships --------------------------------------------------------------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- Prevent duplicate A->B and B->A pairs
create unique index if not exists friendships_pair_unique_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status);

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;

-- 2) Band Groups & Members ----------------------------------------------------
create table if not exists public.band_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  description text not null default '',
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists band_groups_owner_idx
  on public.band_groups (owner_id, created_at desc);

alter table public.band_groups enable row level security;

create table if not exists public.band_group_members (
  group_id  uuid not null references public.band_groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  added_by  uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists band_group_members_user_idx
  on public.band_group_members (user_id, group_id);

alter table public.band_group_members enable row level security;

-- 3) Live Rooms & Members -----------------------------------------------------
create table if not exists public.live_rooms (
  id                 uuid primary key default gen_random_uuid(),
  room_code          text not null unique,
  name               text not null check (length(trim(name)) between 1 and 120),
  host_id            uuid not null references public.profiles(id) on delete cascade,
  band_group_id      uuid references public.band_groups(id) on delete set null,
  setlist_id         text,
  setlist_snapshot   jsonb not null default '[]'::jsonb,
  current_song_index integer not null default 0 check (current_song_index >= 0),
  current_song_id    text,
  current_key_shift  integer not null default 0 check (current_key_shift between -11 and 11),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists live_rooms_host_active_idx
  on public.live_rooms (host_id, is_active, updated_at desc);

create index if not exists live_rooms_code_idx
  on public.live_rooms (room_code);

alter table public.live_rooms enable row level security;

create table if not exists public.live_room_members (
  room_id    uuid not null references public.live_rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('host', 'member')),
  status     text not null default 'invited' check (status in ('invited', 'joined')),
  invited_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists live_room_members_user_idx
  on public.live_room_members (user_id, status);

alter table public.live_room_members enable row level security;

-- 4) Shared updated_at Trigger Function ---------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql as
$$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_friendships_updated_at on public.friendships;
create trigger trg_friendships_updated_at
  before update on public.friendships
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_band_groups_updated_at on public.band_groups;
create trigger trg_band_groups_updated_at
  before update on public.band_groups
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_live_rooms_updated_at on public.live_rooms;
create trigger trg_live_rooms_updated_at
  before update on public.live_rooms
  for each row execute function public.touch_updated_at();

-- 5) Auto-add Owner to band_group_members & Host to live_room_members ---------
create or replace function public.handle_new_band_group()
returns trigger
language plpgsql
security definer
set search_path = public as
$$
begin
  insert into public.band_group_members (group_id, user_id, role, added_by)
  values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_band_groups_add_owner on public.band_groups;
create trigger trg_band_groups_add_owner
  after insert on public.band_groups
  for each row execute function public.handle_new_band_group();

create or replace function public.handle_new_live_room()
returns trigger
language plpgsql
security definer
set search_path = public as
$$
begin
  insert into public.live_room_members (room_id, user_id, role, status)
  values (new.id, new.host_id, 'host', 'joined')
  on conflict (room_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_live_rooms_add_host on public.live_rooms;
create trigger trg_live_rooms_add_host
  after insert on public.live_rooms
  for each row execute function public.handle_new_live_room();

-- 6) SECURITY DEFINER Helper Functions (avoid RLS recursion) ------------------
create or replace function public.is_band_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public as
$$
  select exists (
    select 1 from public.band_groups
     where id = p_group_id
       and owner_id = auth.uid()
  );
$$;

create or replace function public.is_band_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public as
$$
  select exists (
    select 1 from public.band_group_members
     where group_id = p_group_id
       and user_id = auth.uid()
  );
$$;

create or replace function public.is_live_room_host(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public as
$$
  select exists (
    select 1 from public.live_rooms
     where id = p_room_id
       and host_id = auth.uid()
  );
$$;

create or replace function public.is_live_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public as
$$
  select exists (
    select 1 from public.live_room_members
     where room_id = p_room_id
       and user_id = auth.uid()
  );
$$;

grant execute on function public.is_band_group_owner(uuid) to authenticated;
grant execute on function public.is_band_group_member(uuid) to authenticated;
grant execute on function public.is_live_room_host(uuid) to authenticated;
grant execute on function public.is_live_room_member(uuid) to authenticated;

-- 7) Row-Level Security Policies ----------------------------------------------

-- 7a) Restrictive RBAC Gate: require approved & active user on all new tables
drop policy if exists "require approved user" on public.friendships;
create policy "require approved user" on public.friendships as restrictive
  for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

drop policy if exists "require approved user" on public.band_groups;
create policy "require approved user" on public.band_groups as restrictive
  for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

drop policy if exists "require approved user" on public.band_group_members;
create policy "require approved user" on public.band_group_members as restrictive
  for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

drop policy if exists "require approved user" on public.live_rooms;
create policy "require approved user" on public.live_rooms as restrictive
  for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

drop policy if exists "require approved user" on public.live_room_members;
create policy "require approved user" on public.live_room_members as restrictive
  for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

-- 7b) friendships policies
drop policy if exists "friendships select own" on public.friendships;
create policy "friendships select own" on public.friendships
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friendships insert requester" on public.friendships;
create policy "friendships insert requester" on public.friendships
  for insert to authenticated
  with check (auth.uid() = requester_id and requester_id <> addressee_id);

drop policy if exists "friendships update addressee" on public.friendships;
create policy "friendships update addressee" on public.friendships
  for update to authenticated
  using (auth.uid() = addressee_id or auth.uid() = requester_id)
  with check (auth.uid() = addressee_id or auth.uid() = requester_id);

drop policy if exists "friendships delete own" on public.friendships;
create policy "friendships delete own" on public.friendships
  for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- 7c) band_groups policies
drop policy if exists "band_groups select member" on public.band_groups;
create policy "band_groups select member" on public.band_groups
  for select to authenticated
  using (owner_id = auth.uid() or public.is_band_group_member(id));

drop policy if exists "band_groups insert owner" on public.band_groups;
create policy "band_groups insert owner" on public.band_groups
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "band_groups update owner" on public.band_groups;
create policy "band_groups update owner" on public.band_groups
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "band_groups delete owner" on public.band_groups;
create policy "band_groups delete owner" on public.band_groups
  for delete to authenticated
  using (owner_id = auth.uid());

-- 7d) band_group_members policies
drop policy if exists "band_group_members select member" on public.band_group_members;
create policy "band_group_members select member" on public.band_group_members
  for select to authenticated
  using (public.is_band_group_owner(group_id) or public.is_band_group_member(group_id));

drop policy if exists "band_group_members insert owner" on public.band_group_members;
create policy "band_group_members insert owner" on public.band_group_members
  for insert to authenticated
  with check (public.is_band_group_owner(group_id));

drop policy if exists "band_group_members delete owner or self" on public.band_group_members;
create policy "band_group_members delete owner or self" on public.band_group_members
  for delete to authenticated
  using (
    public.is_band_group_owner(group_id)
    or (user_id = auth.uid() and role <> 'owner')
  );

-- 7e) live_rooms policies
drop policy if exists "live_rooms select active or member" on public.live_rooms;
create policy "live_rooms select active or member" on public.live_rooms
  for select to authenticated
  using (
    host_id = auth.uid()
    or public.is_live_room_member(id)
    or is_active = true
  );

drop policy if exists "live_rooms insert host" on public.live_rooms;
create policy "live_rooms insert host" on public.live_rooms
  for insert to authenticated
  with check (host_id = auth.uid());

drop policy if exists "live_rooms update host" on public.live_rooms;
create policy "live_rooms update host" on public.live_rooms
  for update to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

drop policy if exists "live_rooms delete host" on public.live_rooms;
create policy "live_rooms delete host" on public.live_rooms
  for delete to authenticated
  using (host_id = auth.uid());

-- 7f) live_room_members policies
drop policy if exists "live_room_members select room member" on public.live_room_members;
create policy "live_room_members select room member" on public.live_room_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_live_room_host(room_id)
    or public.is_live_room_member(room_id)
  );

drop policy if exists "live_room_members insert host or self join" on public.live_room_members;
create policy "live_room_members insert host or self join" on public.live_room_members
  for insert to authenticated
  with check (
    public.is_live_room_host(room_id)
    or (user_id = auth.uid() and role = 'member')
  );

drop policy if exists "live_room_members update self or host" on public.live_room_members;
create policy "live_room_members update self or host" on public.live_room_members
  for update to authenticated
  using (user_id = auth.uid() or public.is_live_room_host(room_id))
  with check (user_id = auth.uid() or public.is_live_room_host(room_id));

drop policy if exists "live_room_members delete host or self" on public.live_room_members;
create policy "live_room_members delete host or self" on public.live_room_members
  for delete to authenticated
  using (public.is_live_room_host(room_id) or user_id = auth.uid());

-- 8) Table Grants -------------------------------------------------------------
grant select, insert, update, delete on public.friendships       to authenticated;
grant select, insert, update, delete on public.band_groups       to authenticated;
grant select, insert, update, delete on public.band_group_members to authenticated;
grant select, insert, update, delete on public.live_rooms        to authenticated;
grant select, insert, update, delete on public.live_room_members to authenticated;

-- 9) Enable Supabase Realtime Publication -------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_rooms'
    ) then
      alter publication supabase_realtime add table public.live_rooms;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_room_members'
    ) then
      alter publication supabase_realtime add table public.live_room_members;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
    ) then
      alter publication supabase_realtime add table public.friendships;
    end if;
  end if;
end $$;
