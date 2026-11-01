-- Videoaulas (biblioteca pessoal) e cache de buscas no YouTube (para economizar a cota gratuita da API).
create table if not exists public.video_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  youtube_id text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  url text not null check (url ~ '^https://'),
  title text not null check (char_length(title) between 1 and 500),
  channel_title text,
  channel_id text,
  thumbnail_url text,
  duration_seconds int,
  published_at timestamptz,
  subject_id uuid references public.subjects(id) on delete set null,
  syllabus_topic_id uuid references public.syllabus_topics(id) on delete set null,
  favorite boolean not null default false,
  watch_later boolean not null default false,
  watched_at timestamptz,
  notes text,
  source text not null default 'busca' check (source in ('busca','manual')),
  history jsonb not null default '[]',
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists video_unique_per_user on public.video_lessons(user_id, youtube_id) where youtube_id is not null;
create index if not exists video_user on public.video_lessons(user_id, updated_at);

create table if not exists public.video_search_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  query text not null,
  subject_id uuid references public.subjects(id) on delete cascade,
  syllabus_topic_id uuid references public.syllabus_topics(id) on delete cascade,
  results jsonb not null default '[]',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vcache_user on public.video_search_cache(user_id, updated_at);

do $$
declare t text;
begin
  foreach t in array array['video_lessons','video_search_cache'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated before insert or update on public.%1$I for each row execute function public.set_updated_at()', t);
    execute format('drop trigger if exists trg_%1$s_deleted on public.%1$I', t);
    execute format('create trigger trg_%1$s_deleted after delete on public.%1$I for each row execute function public.log_deletion()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists own_all on public.%I', t);
    execute format('create policy own_all on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
