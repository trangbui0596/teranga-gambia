-- Follow-up to tourists: a visitor who got "Not sure, Noor will answer" can reply NOTIFY to be messaged when Noor has answered.
-- The number is stored only with that consent, deleted once the answer is sent, and purged after 14 days.
create table if not exists public.visitor_followups (
  id uuid primary key default gen_random_uuid(),
  visitor_question_id uuid not null,
  phone text not null,
  channel text not null check (channel in ('whatsapp','sms')),
  lang text not null check (lang in ('en','de','nl')),
  created_at timestamptz not null default now()
);
alter table public.visitor_followups enable row level security;
revoke all on public.visitor_followups from anon, authenticated;
grant all on public.visitor_followups to service_role;
create index if not exists visitor_followups_created_idx on public.visitor_followups (created_at);
