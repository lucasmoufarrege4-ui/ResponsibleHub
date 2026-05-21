-- ============================================================
-- 7. STUDY NOTES — run this in Supabase SQL Editor to enable notes saving
-- ============================================================
-- create table if not exists public.study_notes (
--   id         uuid        not null default gen_random_uuid() primary key,
--   user_id    uuid        not null references public.profiles(id) on delete cascade,
--   subject    text        not null default 'Other',
--   title      text        not null default '',
--   content    text        not null default '',
--   created_at timestamptz not null default now()
-- );
-- alter table public.study_notes enable row level security;
-- create policy "study_notes_all"
--   on public.study_notes for all
--   using  (auth.uid() = user_id)
--   with check (auth.uid() = user_id);
-- ============================================================

-- ============================================================
-- ResponsibleHub — Supabase Setup
-- Run this entire file in your Supabase SQL Editor:
--   https://app.supabase.com → your project → SQL Editor → New query
--
-- ALSO DO THIS in Supabase Dashboard:
--
--   1. Authentication → URL Configuration
--        Site URL:      http://localhost:3000
--        Redirect URLs: http://localhost:3000/**
--
--   2. Authentication → Providers → Google → Enable
--        - Go to https://console.cloud.google.com
--        - Create a project → APIs & Services → Credentials
--        - Create OAuth 2.0 Client ID (Web application)
--        - Add Authorized redirect URI:
--            https://<your-project-ref>.supabase.co/auth/v1/callback
--        - Copy the Client ID and Client Secret into Supabase
-- ============================================================

-- 1. PROFILES (one row per user, stores username + XP)
create table if not exists public.profiles (
  id          uuid        references auth.users on delete cascade primary key,
  username    text        unique not null,
  xp          integer     not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Anyone can read all profiles (needed for leaderboard)
create policy "profiles_select"
  on public.profiles for select using (true);

-- Users can only insert their own row
create policy "profiles_insert"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Users can only update their own row
create policy "profiles_update"
  on public.profiles for update
  using (auth.uid() = id);


-- 2. DAILY PLANS (schedule + goals per user per day)
create table if not exists public.daily_plans (
  id          uuid   not null default gen_random_uuid() primary key,
  user_id     uuid   not null references public.profiles(id) on delete cascade,
  date        date   not null default current_date,
  schedule    text   not null default '',
  goals       jsonb  not null default '[]',
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);
alter table public.daily_plans enable row level security;

-- Users can only read/write their own plans
create policy "daily_plans_all"
  on public.daily_plans for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 3. STORAGE BUCKET for challenge proof photos
insert into storage.buckets (id, name, public)
values ('challenge-proofs', 'challenge-proofs', true)
on conflict (id) do nothing;

-- Anyone can view proofs (bucket is public, but RLS still applies to objects)
create policy "proofs_select"
  on storage.objects for select
  using (bucket_id = 'challenge-proofs');

-- Authenticated users can upload their own proofs
create policy "proofs_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'challenge-proofs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- 4. XP INCREMENT FUNCTION (atomic, avoids race conditions)
create or replace function public.increment_xp(uid uuid, amount integer)
returns void language sql security definer as $$
  update public.profiles
  set xp = xp + amount
  where id = uid;
$$;
grant execute on function public.increment_xp to authenticated;


-- 5. REMINDERS (daily habit completion tracking)
create table if not exists public.reminders (
  id           uuid        not null default gen_random_uuid() primary key,
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  date         date        not null default current_date,
  reminder_id  text        not null,
  completed_at timestamptz not null default now(),
  unique (user_id, date, reminder_id)
);
alter table public.reminders enable row level security;

create policy "reminders_all"
  on public.reminders for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 6. CHALLENGE COMPLETIONS (tracks which daily challenges each user has done)
create table if not exists public.challenge_completions (
  id           uuid        not null default gen_random_uuid() primary key,
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  challenge_id text        not null,            -- 'study' or 'eco'
  date         date        not null default current_date,
  completed_at timestamptz not null default now(),
  unique (user_id, challenge_id, date)          -- one completion per type per day
);
alter table public.challenge_completions enable row level security;

create policy "challenge_completions_all"
  on public.challenge_completions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
