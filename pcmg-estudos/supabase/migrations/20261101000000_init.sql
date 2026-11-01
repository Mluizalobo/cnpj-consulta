-- =====================================================================
-- Meu Concurso PCMG — estrutura inicial do banco (Supabase / PostgreSQL)
-- Execute no Supabase: SQL Editor > New query > cole este arquivo > Run.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Funções utilitárias ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Registro de exclusões (permite sincronizar remoções entre aparelhos)
create table if not exists public.deleted_records (
  id bigint generated always as identity primary key,
  user_id uuid not null, -- sem FK: precisa existir mesmo durante a exclusão em cascata do usuário
  table_name text not null,
  record_id uuid not null,
  deleted_at timestamptz not null default now()
);
create index if not exists deleted_records_user_time on public.deleted_records(user_id, deleted_at);

create or replace function public.log_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.deleted_records(user_id, table_name, record_id) values (old.user_id, tg_table_name, old.id);
  return old;
end $$;

-- ---------- Perfil e configurações ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_self check (id = user_id)
);

create table if not exists public.user_settings (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  study_start_date date not null default current_date,
  edital_date date,
  edital_published boolean not null default false,
  exam_date date,
  exam_date_confirmed boolean not null default false,
  final_stretch_weeks int not null default 6 check (final_stretch_weeks between 1 and 26),
  target_accuracy numeric(5,2) not null default 70 check (target_accuracy between 1 and 100),
  daily_goal_minutes int not null default 120 check (daily_goal_minutes between 0 and 1440),
  session_minutes int not null default 60 check (session_minutes between 5 and 600),
  phase_splits jsonb not null default '{"1":{"theory":35,"questions":25},"2":{"theory":30,"questions":30},"3":{"theory":15,"questions":45}}',
  rotation jsonb not null default '{"phase1":[],"phase2":[]}',
  review_intervals int[] not null default '{1,7,30}',
  review_minutes int not null default 20,
  max_reviews_per_day int not null default 6,
  rest_weekdays int[] not null default '{0}',
  mock_duration_minutes int not null default 270,
  auto_add_errors boolean not null default false,
  show_quotes boolean not null default true,
  timer jsonb not null default '{"sound":true,"vibrate":true,"autoAdvance":true,"notifications":false}',
  exam_board text,
  exam_board_confirmed boolean not null default false,
  exam_total_questions int not null default 70,
  applied_version_id uuid,
  competition_check_frequency text not null default 'diaria',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_self check (id = user_id)
);

-- ---------- Matérias e plano ----------
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text,
  name text not null check (char_length(name) between 1 and 200),
  short_name text not null check (char_length(short_name) between 1 and 80),
  color text not null default '#2E6B4B',
  exam_questions int not null default 0 check (exam_questions between 0 and 500),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subjects_user on public.subjects(user_id, updated_at);

create table if not exists public.study_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  position int not null default 0,
  slot_type text not null check (slot_type in ('subject','rotation','weekly_review','mixed_questions')),
  subject_id uuid references public.subjects(id) on delete set null,
  duration_minutes int not null default 60 check (duration_minutes between 5 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists study_plan_user on public.study_plan(user_id, updated_at);

-- ---------- Edital verticalizado ----------
create table if not exists public.syllabus_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  parent_id uuid references public.syllabus_topics(id) on delete cascade,
  level int not null default 1 check (level between 1 and 6),
  code text,
  title text not null check (char_length(title) between 1 and 1000),
  sort_order int not null default 0,
  status text not null default 'nao_estudado' check (status in ('nao_estudado','estudado','revisado','dominado')),
  priority boolean not null default false,
  notes text,
  manual_seconds int not null default 0,
  manual_questions int not null default 0,
  manual_correct int not null default 0,
  in_current_edital boolean not null default true,
  origin text not null default 'manual' check (origin in ('preliminar','edital','manual')),
  version_id uuid,
  last_studied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists syllabus_user on public.syllabus_topics(user_id, updated_at);
create index if not exists syllabus_subject on public.syllabus_topics(subject_id);

-- ---------- Sessões e revisões ----------
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  subject_id uuid references public.subjects(id) on delete set null,
  slot_key text,
  review_id uuid,
  syllabus_topic_id uuid references public.syllabus_topics(id) on delete set null,
  activity text not null check (activity in ('teoria_questoes','teoria','questoes','revisao','simulado')),
  label text,
  topic text,
  notes text,
  phase int not null default 1 check (phase between 1 and 3),
  planned_minutes int not null default 60,
  theory_seconds int not null default 0 check (theory_seconds >= 0),
  practice_seconds int not null default 0 check (practice_seconds >= 0),
  total_seconds int not null default 0 check (total_seconds >= 0 and total_seconds <= 86400),
  questions_done int not null default 0 check (questions_done >= 0),
  questions_correct int not null default 0 check (questions_correct >= 0),
  status text not null default 'em_andamento' check (status in ('em_andamento','concluida')),
  source text not null default 'timer' check (source in ('timer','manual')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint correct_le_done check (questions_correct <= questions_done)
);
create index if not exists sessions_user on public.study_sessions(user_id, updated_at);
create index if not exists sessions_user_date on public.study_sessions(user_id, date);

create table if not exists public.review_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid references public.study_sessions(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  syllabus_topic_id uuid references public.syllabus_topics(id) on delete set null,
  topic text,
  interval_days int not null check (interval_days > 0),
  base_date date not null,
  original_due_date date not null,
  due_date date not null,
  status text not null default 'pendente' check (status in ('pendente','concluida')),
  completed_at timestamptz,
  reschedule_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Evita revisões duplicadas para a mesma sessão e intervalo
create unique index if not exists review_unique_session_interval on public.review_schedule(session_id, interval_days) where session_id is not null;
create index if not exists reviews_user on public.review_schedule(user_id, updated_at);
create index if not exists reviews_user_due on public.review_schedule(user_id, status, due_date);

-- ---------- Questões ----------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  syllabus_topic_id uuid references public.syllabus_topics(id) on delete set null,
  topic text,
  statement text not null check (char_length(statement) between 1 and 8000),
  option_a text not null, option_b text not null, option_c text not null, option_d text not null, option_e text not null,
  correct_option char(1) not null check (correct_option in ('A','B','C','D','E')),
  explanation text,
  difficulty text not null default 'medio' check (difficulty in ('facil','medio','dificil')),
  board text,
  year int check (year is null or year between 1950 and 2100),
  tags text[] not null default '{}',
  origin text not null default 'manual' check (origin in ('autoral','manual','importada')),
  favorite boolean not null default false,
  needs_review boolean not null default false,
  status text not null default 'nao_respondida' check (status in ('nao_respondida','correta','incorreta')),
  times_answered int not null default 0,
  last_answered_at timestamptz,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists questions_unique_hash on public.questions(user_id, content_hash);
create index if not exists questions_user on public.questions(user_id, updated_at);
create index if not exists questions_subject on public.questions(user_id, subject_id);

create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  topic text,
  selected_option char(1) check (selected_option in ('A','B','C','D','E')),
  correct_option char(1) not null check (correct_option in ('A','B','C','D','E')),
  is_correct boolean not null,
  difficulty text check (difficulty in ('facil','medio','dificil')),
  -- treino = resolução normal; simulado = prova simulada; revisao = nova tentativa no caderno de erros
  mode text not null check (mode in ('treino','simulado','revisao')),
  error_note_id uuid,
  mock_exam_id uuid,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists attempts_user on public.question_attempts(user_id, updated_at);
create index if not exists attempts_user_subject on public.question_attempts(user_id, subject_id, answered_at);

create table if not exists public.error_notebook (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  topic text,
  statement text,
  my_answer text,
  correct_answer text,
  explanation text,
  personal_note text,
  error_date date not null default current_date,
  last_error_at timestamptz not null default now(),
  occurrences int not null default 1 check (occurrences >= 0),
  review_count int not null default 0 check (review_count >= 0),
  last_reviewed_at timestamptz,
  status text not null default 'pendente' check (status in ('pendente','revisando','dominado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notebook_user on public.error_notebook(user_id, updated_at);

-- ---------- Simulados ----------
create table if not exists public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'completo' check (kind in ('completo','personalizado')),
  status text not null default 'em_andamento' check (status in ('em_andamento','finalizado')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  time_limit_seconds int not null check (time_limit_seconds > 0),
  elapsed_seconds int not null default 0,
  resumed_at timestamptz,
  total_questions int not null check (total_questions > 0),
  answered_count int not null default 0,
  correct_count int,
  current_index int not null default 0,
  distribution jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mocks_user on public.mock_exams(user_id, updated_at);

-- Questões do simulado + respostas (tabela única, mais simples que mock_exam_answers separada)
create table if not exists public.mock_exam_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mock_exam_id uuid not null references public.mock_exams(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  position int not null,
  subject_id uuid references public.subjects(id) on delete set null,
  correct_option char(1) not null check (correct_option in ('A','B','C','D','E')),
  selected_option char(1) check (selected_option in ('A','B','C','D','E')),
  flagged boolean not null default false,
  is_correct boolean,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mock_exam_id, position)
);
create index if not exists mockq_user on public.mock_exam_questions(user_id, updated_at);

alter table public.question_attempts
  drop constraint if exists attempts_mock_fk,
  add constraint attempts_mock_fk foreign key (mock_exam_id) references public.mock_exams(id) on delete set null;

-- ---------- Central do Concurso: dados pessoais ----------
create table if not exists public.plan_update_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version_id uuid,
  document_id uuid,
  title text not null,
  summary text not null default '',
  changes jsonb not null default '[]',
  snapshot_before jsonb not null default '{}',
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists planhist_user on public.plan_update_history(user_id, updated_at);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('concurso','edital','plano','sistema')),
  title text not null,
  body text,
  link text,
  source_update_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notif_user on public.user_notifications(user_id, updated_at);

create table if not exists public.syllabus_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id uuid,
  source_name text,
  status text not null default 'analisado' check (status in ('analisado','aplicado','descartado','erro')),
  analysis jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists importjobs_user on public.syllabus_import_jobs(user_id, updated_at);

-- ---------- Central do Concurso: dados PÚBLICOS (escritos só pelo servidor) ----------
create table if not exists public.competition_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  kind text not null check (kind in ('oficial','banca','diario_oficial','secundaria')),
  active boolean not null default true,
  last_checked_at timestamptz,
  last_status text,
  last_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.competition_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.competition_sources(id) on delete set null,
  source_name text not null,
  source_kind text not null check (source_kind in ('oficial','banca','diario_oficial','secundaria')),
  url text not null,
  title text not null,
  doc_type text not null check (doc_type in ('edital_abertura','retificacao','comunicado','cronograma','convocacao','resultado','noticia','outro')),
  content_hash text not null unique, -- impede processar o mesmo documento duas vezes
  published_at date,
  fetched_at timestamptz not null default now(),
  cargo_match text not null default 'indefinido' check (cargo_match in ('investigador','multi_cargo','outro_cargo','indefinido')),
  is_official boolean not null default false,
  confidence numeric(4,3) not null default 0,
  reliability text not null default 'aguardando_confirmacao' check (reliability in ('confirmado','preliminar','aguardando_confirmacao')),
  year int,
  edital_number text,
  text_excerpt text,
  page_count int,
  parsed jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compdocs_updated on public.competition_documents(updated_at);

-- Texto integral (não sincronizado com o app, consultado sob demanda)
create table if not exists public.competition_document_texts (
  document_id uuid primary key references public.competition_documents(id) on delete cascade,
  pages jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.competition_updates (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.competition_documents(id) on delete set null,
  kind text not null check (kind in ('nova_informacao','novo_documento','alteracao_importante','edital_publicado','pista_nao_oficial')),
  title text not null,
  summary text not null default '',
  details jsonb not null default '{}',
  reliability text not null default 'aguardando_confirmacao' check (reliability in ('confirmado','preliminar','aguardando_confirmacao')),
  source_url text,
  source_kind text not null default 'oficial',
  dedupe_key text unique,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compupd_updated on public.competition_updates(updated_at);

create table if not exists public.competition_versions (
  id uuid primary key default gen_random_uuid(),
  version_number int not null unique,
  document_id uuid references public.competition_documents(id) on delete set null,
  base_version_id uuid references public.competition_versions(id) on delete set null,
  label text not null,
  data jsonb not null,
  diff jsonb not null default '[]',
  reliability text not null default 'aguardando_confirmacao' check (reliability in ('confirmado','preliminar','aguardando_confirmacao')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitoring_logs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  trigger text not null check (trigger in ('cron','manual','teste')),
  status text not null check (status in ('ok','erro','parcial','ignorado')),
  sources_checked int not null default 0,
  documents_found int not null default 0,
  new_documents int not null default 0,
  message text,
  errors jsonb not null default '[]', -- nunca contém dados pessoais
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists monlogs_updated on public.monitoring_logs(updated_at);
create index if not exists monlogs_started on public.monitoring_logs(started_at desc);

-- ---------- Gatilhos ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','subjects','study_plan','syllabus_topics','study_sessions','review_schedule',
    'questions','question_attempts','error_notebook','mock_exams','mock_exam_questions','plan_update_history',
    'user_notifications','syllabus_import_jobs','competition_sources','competition_documents','competition_updates',
    'competition_versions','monitoring_logs']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated before insert or update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['subjects','study_plan','syllabus_topics','study_sessions','review_schedule','questions',
    'question_attempts','error_notebook','mock_exams','mock_exam_questions','plan_update_history','user_notifications','syllabus_import_jobs']
  loop
    execute format('drop trigger if exists trg_%1$s_deleted on public.%1$I', t);
    execute format('create trigger trg_%1$s_deleted after delete on public.%1$I for each row execute function public.log_deletion()', t);
  end loop;
end $$;

-- Cria perfil ao cadastrar usuário
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, user_id) values (new.id, new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Segurança: Row Level Security ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','subjects','study_plan','syllabus_topics','study_sessions','review_schedule',
    'questions','question_attempts','error_notebook','mock_exams','mock_exam_questions','plan_update_history',
    'user_notifications','syllabus_import_jobs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists own_select on public.%I', t);
    execute format('drop policy if exists own_insert on public.%I', t);
    execute format('drop policy if exists own_update on public.%I', t);
    execute format('drop policy if exists own_delete on public.%I', t);
    execute format('create policy own_select on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy own_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy own_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;

  -- Dados públicos do concurso: qualquer usuário logado lê; ninguém escreve pelo app (só o servidor, com a chave secreta).
  foreach t in array array['competition_sources','competition_documents','competition_updates','competition_versions','monitoring_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists public_read on public.%I', t);
    execute format('create policy public_read on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

alter table public.competition_document_texts enable row level security;
drop policy if exists public_read on public.competition_document_texts;
create policy public_read on public.competition_document_texts for select to authenticated using (true);

alter table public.deleted_records enable row level security;
drop policy if exists own_select on public.deleted_records;
create policy own_select on public.deleted_records for select to authenticated using (user_id = (select auth.uid()));

-- Garante que a chave pública (anon) não acesse nada sem login
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.competition_sources, public.competition_documents, public.competition_document_texts,
  public.competition_updates, public.competition_versions, public.monitoring_logs, public.deleted_records from authenticated;
grant usage, select on all sequences in schema public to authenticated;
