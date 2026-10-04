-- AI-suggested question cards. The AI proposes, code verifies against what visitors wrote, a person approves (src/lib/ideas.ts).
-- Server code only (service role). Nothing here is shown to visitors until a card is approved and Noor has recorded an answer.
create table if not exists public.question_ideas (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  question text not null check (char_length(question) between 12 and 120),
  keywords text[] not null check (cardinality(keywords) between 1 and 4),
  support int not null check (support >= 1),
  examples text[] not null default '{}',
  status text not null default 'proposed' check (status in ('proposed','approved','dismissed')),
  week text not null,
  question_id uuid references public.questions(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.question_ideas enable row level security;
revoke all on public.question_ideas from anon, authenticated;
grant all on public.question_ideas to service_role;
create unique index if not exists question_ideas_topic_uidx on public.question_ideas (lower(topic));
create index if not exists question_ideas_status_idx on public.question_ideas (status, created_at);
