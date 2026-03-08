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

create table if not exists public.reel_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_label text not null,
  recommended_clip_id text,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.reel_generations enable row level security;

create table if not exists public.brainrot_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  script_guidance text not null default '',
  template_id text not null,
  brainrot_type text not null,
  selected_voice_id text not null,
  selected_gameplay_preset_id text not null,
  selected_caption_preset_id text not null,
  gameplay_start_offset integer not null default 0,
  target_duration_seconds integer not null,
  render_count integer not null default 1,
  primary_render_title text,
  primary_delivery_url text,
  run_signature text not null,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.brainrot_generations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'render_jobs'
      and policyname = 'allow anonymous inserts for hackathon demos'
  ) then
    create policy "allow anonymous inserts for hackathon demos"
    on public.render_jobs
    for insert
    to anon
    with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'render_jobs'
      and policyname = 'allow anonymous reads for hackathon demos'
  ) then
    create policy "allow anonymous reads for hackathon demos"
    on public.render_jobs
    for select
    to anon
    using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reel_generations'
      and policyname = 'users can insert their own reel generations'
  ) then
    create policy "users can insert their own reel generations"
    on public.reel_generations
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reel_generations'
      and policyname = 'users can view their own reel generations'
  ) then
    create policy "users can view their own reel generations"
    on public.reel_generations
    for select
    to authenticated
    using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reel_generations'
      and policyname = 'users can update their own reel generations'
  ) then
    create policy "users can update their own reel generations"
    on public.reel_generations
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'brainrot_generations'
      and policyname = 'users can insert their own brainrot generations'
  ) then
    create policy "users can insert their own brainrot generations"
    on public.brainrot_generations
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'brainrot_generations'
      and policyname = 'users can view their own brainrot generations'
  ) then
    create policy "users can view their own brainrot generations"
    on public.brainrot_generations
    for select
    to authenticated
    using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'brainrot_generations'
      and policyname = 'users can update their own brainrot generations'
  ) then
    create policy "users can update their own brainrot generations"
    on public.brainrot_generations
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end
$$;
