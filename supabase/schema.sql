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
