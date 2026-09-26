-- Public player profile, one per auth user (guests included). Gamification data such as XP
-- and badges will hang off this id, so a guest keeps everything after linking an email.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 20),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Display names are shown to other players (lobbies, leaderboards later).
create policy "Signed-in users can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Rows are only created by the trigger below and never deleted by clients, and only the
-- display name may be changed.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'Guest ' || lpad(floor(random() * 10000)::int::text, 4, '0'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
