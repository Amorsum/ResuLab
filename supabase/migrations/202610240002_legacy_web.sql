-- Compatibility tables for cloud resumes and the separate legacy AI Worker.
-- Run as the database owner on the SAME Supabase project used by the frontend.
begin;

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '未命名简历',
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists resumes_user_updated_idx on public.resumes(user_id, updated_at desc);
alter table public.resumes enable row level security;
revoke all on public.resumes from anon, authenticated;
grant select, insert, update, delete on public.resumes to authenticated;
grant all on public.resumes to service_role;

do $$ begin
  if not exists (select from pg_policies where schemaname = 'public' and tablename = 'resumes' and policyname = 'resumes_owner') then
    create policy resumes_owner on public.resumes for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  status text not null default 'active',
  created_at timestamptz not null default now()
);
alter table public.memberships enable row level security;
revoke all on public.memberships from anon, authenticated;
grant all on public.memberships to service_role;

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('generate', 'polish', 'interview')),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_feature_created_idx on public.ai_usage_logs(user_id, feature, created_at);
alter table public.ai_usage_logs enable row level security;
revoke all on public.ai_usage_logs from anon, authenticated;
grant all on public.ai_usage_logs to service_role;

notify pgrst, 'reload schema';
commit;
