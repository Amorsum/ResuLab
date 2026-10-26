-- Additive migration. Execute once on a TEST Supabase project, in this transaction.
begin;
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('queued','running','awaiting_input','completed','failed')),
  jd_text text not null, resume_snapshot jsonb not null, resume_revision text not null,
  run_view jsonb not null, stage integer not null default 0 check (stage between 0 and 5),
  retry_count integer not null default 0, lease_token uuid, lease_expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  finished_at timestamptz, awaiting_since timestamptz, waiting_ms bigint not null default 0
);
create index agent_runs_owner_created on public.agent_runs(owner_id, created_at desc);
create index agent_runs_queue on public.agent_runs(status, lease_expires_at, created_at);
create table public.agent_operations (
  owner_id uuid not null references auth.users(id) on delete cascade, scope text not null, key text not null,
  input_hash text not null, run_id uuid not null references public.agent_runs(id) on delete cascade,
  response jsonb not null, created_at timestamptz not null default now(), primary key(owner_id,scope,key)
);
create table public.agent_steps (
  run_id uuid not null references public.agent_runs(id) on delete cascade, id text not null,
  tool text not null, status text not null, attempt integer not null, result jsonb not null,
  updated_at timestamptz not null default now(), primary key(run_id,id)
);
create table public.agent_answers (
  run_id uuid not null references public.agent_runs(id) on delete cascade, question_id text not null,
  answer text not null, round integer not null default 1 check(round = 1), created_at timestamptz not null default now(),
  primary key(run_id,round,question_id)
);
create table public.agent_model_calls (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.agent_runs(id) on delete cascade,
  step_id text not null, model text not null, attempt integer not null, config jsonb not null,
  started_at timestamptz not null default now(), finished_at timestamptz, status text not null default 'started',
  upstream_request_id text, input_tokens integer, output_tokens integer, estimated_cost numeric, currency text not null,
  error_code text
);
create index agent_model_calls_run on public.agent_model_calls(run_id,started_at);

alter table public.agent_runs enable row level security;
alter table public.agent_operations enable row level security;
alter table public.agent_steps enable row level security;
alter table public.agent_answers enable row level security;
alter table public.agent_model_calls enable row level security;
create policy agent_runs_read on public.agent_runs for select to authenticated using(owner_id = auth.uid());
create policy agent_steps_read on public.agent_steps for select to authenticated using(exists(select 1 from public.agent_runs r where r.id = run_id and r.owner_id = auth.uid()));
create policy agent_answers_read on public.agent_answers for select to authenticated using(exists(select 1 from public.agent_runs r where r.id = run_id and r.owner_id = auth.uid()));
-- Model-call diagnostics and idempotency records are server-only. No browser write policies.
revoke all on public.agent_runs, public.agent_operations, public.agent_steps, public.agent_answers, public.agent_model_calls from anon, authenticated;
grant select on public.agent_runs, public.agent_steps, public.agent_answers to authenticated;
grant all on public.agent_runs, public.agent_operations, public.agent_steps, public.agent_answers, public.agent_model_calls to service_role;

create function public.agent_create_run(p_owner uuid, p_key text, p_hash text, p_jd text, p_snapshot jsonb, p_revision text, p_view jsonb, p_max_pending integer, p_max_daily integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare op agent_operations; r agent_runs; response jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  select * into op from agent_operations where owner_id=p_owner and scope='create' and key=p_key;
  if found then
    if op.input_hash <> p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return op.response;
  end if;
  if (select count(*) from agent_runs where owner_id=p_owner and status in ('queued','running','awaiting_input')) >= p_max_pending
    or (select count(*) from agent_runs where owner_id=p_owner and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= p_max_daily
  then raise exception 'RUN_LIMIT'; end if;
  insert into agent_runs(owner_id,status,jd_text,resume_snapshot,resume_revision,run_view)
    values(p_owner,'queued',p_jd,p_snapshot,p_revision,p_view) returning * into r;
  update agent_runs set run_view=jsonb_set(run_view,'{runId}',to_jsonb(r.id::text)) where id=r.id;
  response=jsonb_build_object('runId',r.id,'status','queued');
  insert into agent_operations(owner_id,scope,key,input_hash,run_id,response) values(p_owner,'create',p_key,p_hash,r.id,response);
  return response;
end $$;

create function public.agent_get_run(p_owner uuid,p_run uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r agent_runs;
begin
  select * into r from agent_runs where id=p_run and owner_id=p_owner;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  return to_jsonb(r);
end $$;

create function public.agent_mutate_run(p_owner uuid,p_run uuid,p_kind text,p_key text,p_hash text,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r agent_runs; op agent_operations; response jsonb; a jsonb; q jsonb; question_list jsonb;
begin
  select * into r from agent_runs where id=p_run and owner_id=p_owner for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  select * into op from agent_operations where owner_id=p_owner and scope=p_kind||':'||p_run::text and key=p_key;
  if found then
    if op.input_hash <> p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return op.response;
  end if;
  if p_kind='answers' then
    if r.status <> 'awaiting_input' then raise exception 'STATE_CONFLICT'; end if;
    if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> jsonb_array_length(r.run_view->'questions')
      or (select count(distinct v->>'questionId') from jsonb_array_elements(p_answers) v) <> jsonb_array_length(p_answers)
      or jsonb_array_length(p_answers) not between 1 and 3 then raise exception 'INVALID_ANSWERS'; end if;
    for a in select value from jsonb_array_elements(p_answers) loop
      if not exists(select 1 from jsonb_array_elements(r.run_view->'questions') v where v->>'id'=a->>'questionId')
        or length(trim(a->>'answer')) not between 1 and 2000 then raise exception 'INVALID_ANSWERS'; end if;
      insert into agent_answers(run_id,question_id,answer) values(p_run,a->>'questionId',a->>'answer');
    end loop;
    select jsonb_agg(v || jsonb_build_object('answer',(select x->>'answer' from jsonb_array_elements(p_answers) x where x->>'questionId'=v->>'id')))
      into question_list from jsonb_array_elements(r.run_view->'questions') v;
    r.run_view=jsonb_set(r.run_view,'{questions}',question_list);
    r.waiting_ms=r.waiting_ms + greatest(0,(extract(epoch from (now()-r.awaiting_since))*1000)::bigint);
  elsif p_kind='retry' then
    if r.status <> 'failed' or coalesce((r.run_view#>>'{error,retryable}')::boolean,false)=false or r.retry_count >= 3 then raise exception 'STATE_CONFLICT'; end if;
    r.retry_count=r.retry_count+1;
  else raise exception 'STATE_CONFLICT'; end if;
  r.run_view=jsonb_set(r.run_view-'error','{status}','"queued"');
  update agent_runs set status='queued',run_view=r.run_view, waiting_ms=r.waiting_ms, awaiting_since=null,
    finished_at=null,retry_count=r.retry_count,lease_token=null,lease_expires_at=null,updated_at=now() where id=p_run;
  response=jsonb_build_object('runId',p_run,'status','queued');
  insert into agent_operations(owner_id,scope,key,input_hash,run_id,response) values(p_owner,p_kind||':'||p_run::text,p_key,p_hash,p_run,response);
  return response;
end $$;

create function public.agent_claim_run(p_seconds integer,p_max_concurrent integer) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r agent_runs;
begin
  -- Global lock keeps the concurrency ceiling valid across API replicas.
  perform pg_advisory_xact_lock(7102318788);
  if (select count(*) from agent_runs where status='running' and lease_expires_at>now()) >= p_max_concurrent then return null; end if;
  select * into r from agent_runs where status='queued' or (status='running' and lease_expires_at<=now()) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update agent_runs set status='running',lease_token=gen_random_uuid(),lease_expires_at=now()+make_interval(secs=>p_seconds),
    run_view=jsonb_set(run_view,'{status}','"running"'),updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end $$;

create function public.agent_renew_lease(p_run uuid,p_token uuid,p_seconds integer) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update agent_runs set lease_expires_at=now()+make_interval(secs=>p_seconds),updated_at=now()
    where id=p_run and status='running' and lease_token=p_token and lease_expires_at>now();
  return found;
end $$;

create function public.agent_checkpoint(p_run uuid,p_token uuid,p_view jsonb,p_stage integer,p_status text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r agent_runs; s jsonb;
begin
  if p_status not in ('running','awaiting_input','completed','failed') or p_stage not between 0 and 5 then raise exception 'STATE_CONFLICT'; end if;
  select * into r from agent_runs where id=p_run and status='running' and lease_token=p_token and lease_expires_at>now() for update;
  if not found then raise exception 'LEASE_LOST'; end if;
  p_view=jsonb_set(p_view,'{status}',to_jsonb(p_status));
  p_view=jsonb_set(p_view,'{usage,elapsedMs}',to_jsonb(greatest(0,(extract(epoch from (now()-r.created_at))*1000)::bigint)));
  p_view=jsonb_set(p_view,'{usage,waitingMs}',to_jsonb(r.waiting_ms));
  update agent_runs set run_view=p_view,stage=p_stage,status=p_status,updated_at=now(),
    finished_at=case when p_status in ('completed','failed') then now() else null end,
    awaiting_since=case when p_status='awaiting_input' then now() else null end,
    lease_token=case when p_status='running' then p_token else null end,
    lease_expires_at=case when p_status='running' then lease_expires_at else null end
    where id=p_run returning * into r;
  for s in select value from jsonb_array_elements(p_view->'steps') loop
    insert into agent_steps(run_id,id,tool,status,attempt,result) values(p_run,s->>'id',s->>'tool',s->>'status',(s->>'attempt')::integer,s)
    on conflict(run_id,id) do update set tool=excluded.tool,status=excluded.status,attempt=excluded.attempt,result=excluded.result,updated_at=now();
  end loop;
  return to_jsonb(r);
end $$;

create function public.agent_begin_model_call(p_run uuid,p_token uuid,p_step text,p_model text,p_attempt integer,p_config jsonb,p_max_calls integer,p_currency text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r agent_runs; n integer; call_id uuid;
begin
  select * into r from agent_runs where id=p_run and status='running' and lease_token=p_token and lease_expires_at>now() for update;
  if not found then raise exception 'LEASE_LOST'; end if;
  select count(*) into n from agent_model_calls where run_id=p_run;
  if n >= p_max_calls then raise exception 'BUDGET_EXHAUSTED'; end if;
  insert into agent_model_calls(run_id,step_id,model,attempt,config,currency) values(p_run,p_step,p_model,p_attempt,p_config,p_currency) returning id into call_id;
  update agent_runs set run_view=jsonb_set(jsonb_set(jsonb_set(jsonb_set(run_view,'{usage,calls}',to_jsonb(n+1)),'{usage,inputTokens}','null'),'{usage,outputTokens}','null'),'{usage,estimatedCost}','null') where id=p_run;
  return jsonb_build_object('id',call_id,'calls',n+1);
end $$;

create function public.agent_finish_model_call(p_run uuid,p_token uuid,p_call uuid,p_status text,p_request text,p_input integer,p_output integer,p_cost numeric,p_error text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r agent_runs; usage jsonb;
begin
  select * into r from agent_runs where id=p_run and status='running' and lease_token=p_token and lease_expires_at>now() for update;
  if not found then raise exception 'LEASE_LOST'; end if;
  update agent_model_calls set status=p_status,finished_at=now(),upstream_request_id=p_request,input_tokens=p_input,output_tokens=p_output,estimated_cost=p_cost,error_code=p_error where id=p_call and run_id=p_run and status='started';
  if not found then raise exception 'STATE_CONFLICT'; end if;
  select jsonb_build_object('calls',count(*),
    'inputTokens',case when count(input_tokens)=count(*) then sum(input_tokens) else null end,
    'outputTokens',case when count(output_tokens)=count(*) then sum(output_tokens) else null end,
    'estimatedCost',case when count(estimated_cost)=count(*) then sum(estimated_cost) else null end)
    into usage from agent_model_calls where run_id=p_run;
  update agent_runs set run_view=jsonb_set(run_view,'{usage}',(run_view->'usage') || usage) where id=p_run;
  return usage;
end $$;

-- SECURITY DEFINER RPCs are never callable from a browser token.
revoke all on function public.agent_create_run(uuid,text,text,text,jsonb,text,jsonb,integer,integer) from public,anon,authenticated;
revoke all on function public.agent_get_run(uuid,uuid) from public,anon,authenticated;
revoke all on function public.agent_mutate_run(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.agent_claim_run(integer,integer) from public,anon,authenticated;
revoke all on function public.agent_renew_lease(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.agent_checkpoint(uuid,uuid,jsonb,integer,text) from public,anon,authenticated;
revoke all on function public.agent_begin_model_call(uuid,uuid,text,text,integer,jsonb,integer,text) from public,anon,authenticated;
revoke all on function public.agent_finish_model_call(uuid,uuid,uuid,text,text,integer,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.agent_create_run(uuid,text,text,text,jsonb,text,jsonb,integer,integer), public.agent_get_run(uuid,uuid), public.agent_mutate_run(uuid,uuid,text,text,text,jsonb), public.agent_claim_run(integer,integer), public.agent_renew_lease(uuid,uuid,integer), public.agent_checkpoint(uuid,uuid,jsonb,integer,text), public.agent_begin_model_call(uuid,uuid,text,text,integer,jsonb,integer,text), public.agent_finish_model_call(uuid,uuid,uuid,text,text,integer,integer,numeric,text) to service_role;
commit;
