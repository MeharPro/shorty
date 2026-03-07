create extension if not exists pgcrypto;

create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  headline text not null,
  story_preset text not null,
  platforms text[] not null default '{}',
  delivery_urls text[] not null default '{}',
  source_public_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.render_jobs enable row level security;

create policy "allow anonymous inserts for hackathon demos"
on public.render_jobs
for insert
to anon
with check (true);

create policy "allow anonymous reads for hackathon demos"
on public.render_jobs
for select
to anon
using (true);

create table if not exists public.reel_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_label text not null,
  recommended_clip_id text,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.reel_generations enable row level security;

create policy "users can insert their own reel generations"
on public.reel_generations
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can view their own reel generations"
on public.reel_generations
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can update their own reel generations"
on public.reel_generations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
