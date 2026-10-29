-- Apply after both 20261023 agent and 20261024 legacy_web migrations.
begin;
create table public.career_entries (
  id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check(revision > 0), payload jsonb not null,
  migration_key text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id,migration_key)
);
create index career_entries_owner on public.career_entries(owner_id,updated_at desc);
create table public.career_version_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  key text not null, input_hash text not null, resume_id uuid not null references public.resumes(id) on delete cascade,
  primary key(owner_id,key)
);
alter table public.career_version_operations enable row level security;
revoke all on public.career_version_operations from public,anon,authenticated;
grant all on public.career_version_operations to service_role;
create table public.career_entry_revisions (
  entry_id uuid not null references public.career_entries(id) on delete cascade,
  revision integer not null, owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null, created_at timestamptz not null default now(), primary key(entry_id,revision)
);
alter table public.career_entries enable row level security;
alter table public.career_entry_revisions enable row level security;
create policy career_entries_read on public.career_entries for select to authenticated using(owner_id=auth.uid());
create policy career_revisions_read on public.career_entry_revisions for select to authenticated using(owner_id=auth.uid());
revoke all on public.career_entries,public.career_entry_revisions from anon,authenticated;
grant select on public.career_entries,public.career_entry_revisions to authenticated;
grant all on public.career_entries,public.career_entry_revisions to service_role;

alter table public.agent_runs add column kind text not null default 'resume_optimize' check(kind in ('resume_optimize','career_tailor'));
alter table public.agent_runs add column career_context jsonb;

create function public.career_list_entries(p_owner uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(payload order by updated_at desc),'[]') from career_entries where owner_id=p_owner;
$$;
create function public.career_list_runs(p_owner uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(v),'[]') from (select jsonb_build_object('runId',id,'status',status,'target',career_context->'target','phase',career_context->'phase','updatedAt',updated_at) v
    from agent_runs where owner_id=p_owner and kind='career_tailor' order by updated_at desc limit 30) recent;
$$;
revoke all on function public.career_list_runs(uuid) from public,anon,authenticated;
grant execute on function public.career_list_runs(uuid) to service_role;
create function public.career_list_revisions(p_owner uuid,p_entry uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from career_entries where id=p_entry and owner_id=p_owner) then raise exception 'ENTRY_NOT_FOUND'; end if;
  return (select coalesce(jsonb_agg(payload order by revision desc),'[]') from career_entry_revisions where entry_id=p_entry and owner_id=p_owner);
end $$;
revoke all on function public.career_list_revisions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.career_list_revisions(uuid,uuid) to service_role;
create function public.career_list_versions(p_owner uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(v),'[]') from (select jsonb_build_object('id',id,'title',title,'updatedAt',updated_at) v from resumes where user_id=p_owner order by updated_at desc limit 100) recent;
$$;
create function public.career_get_version(p_owner uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  select jsonb_build_object('id',id,'title',title,'resume',data) into v from resumes where id=p_id and user_id=p_owner;
  if not found then raise exception 'ENTRY_NOT_FOUND'; end if;
  return v;
end $$;
revoke all on function public.career_list_versions(uuid),public.career_get_version(uuid,uuid) from public,anon,authenticated;
grant execute on function public.career_list_versions(uuid),public.career_get_version(uuid,uuid) to service_role;
create function public.career_save_entry(p_owner uuid,p_entry jsonb,p_revision integer,p_confirm boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e career_entries; v jsonb; stamp bigint; entry_id uuid; migration text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,26));
  if p_entry->>'status'='confirmed' and not p_confirm then p_entry=jsonb_set(p_entry,'{status}','"draft"'); end if;
  entry_id=(p_entry->>'id')::uuid; migration=nullif(p_entry->>'migrationKey','');
  if migration is not null and p_revision=0 then
    select * into e from career_entries where owner_id=p_owner and migration_key=migration;
    if found then return e.payload; end if;
  end if;
  select * into e from career_entries where id=entry_id for update;
  if found then
    if e.owner_id<>p_owner then raise exception 'ENTRY_NOT_FOUND'; end if;
    if e.revision=p_revision+1 and (e.payload-'ownerId'-'revision'-'createdAt'-'updatedAt')=p_entry then return e.payload; end if;
    if e.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
  elsif p_revision<>0 then raise exception 'ENTRY_NOT_FOUND'; end if;
  if nullif(p_entry->>'relatedEntryId','') is not null and not exists(
    select 1 from career_entries where id=(p_entry->>'relatedEntryId')::uuid and owner_id=p_owner and id<>entry_id
  ) then raise exception 'ENTRY_NOT_FOUND'; end if;
  stamp=(extract(epoch from clock_timestamp())*1000)::bigint;
  v=p_entry || jsonb_build_object('ownerId',p_owner,'revision',coalesce(e.revision,0)+1,'createdAt',coalesce((e.payload->>'createdAt')::bigint,stamp),'updatedAt',stamp);
  -- Confirmation is an explicit operation, never inferred from AI extraction or edits.
  if v->>'status'='confirmed' and not p_confirm then v=jsonb_set(v,'{status}','"draft"'); end if;
  insert into career_entries(id,owner_id,revision,payload,migration_key) values(entry_id,p_owner,(v->>'revision')::integer,v,migration)
    on conflict(id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=now();
  insert into career_entry_revisions(entry_id,revision,owner_id,payload) values(entry_id,(v->>'revision')::integer,p_owner,v);
  return v;
end $$;

create function public.career_check_sources(p_owner uuid,p_context jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare e jsonb; id text;
begin
  for id in select jsonb_array_elements_text(p_context#>'{selection,selectedIds}') loop
    select value into e from jsonb_array_elements(p_context->'entries') where value->>'id'=split_part(id,':',1);
    if e is null or not exists(select 1 from career_entries where owner_id=p_owner and career_entries.id=(e->>'id')::uuid
      and revision=(e->>'revision')::integer and payload->>'status'='confirmed') then raise exception 'SOURCE_CHANGED'; end if;
  end loop;
  return true;
end $$;
create function public.career_create_run(p_owner uuid,p_key text,p_hash text,p_context jsonb,p_view jsonb,p_max_pending integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; e jsonb; r agent_runs;
begin
  -- Same owner lock and queue as the existing Agent; duplicate retries precede source checks.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  select response into result from agent_operations where owner_id=p_owner and scope='create' and key=p_key and input_hash=p_hash;
  if found then return result; end if;
  for e in select value from jsonb_array_elements(p_context->'entries') loop
    perform 1 from career_entries where owner_id=p_owner and id=(e->>'id')::uuid and payload=e and payload->>'status'='confirmed' for share;
    if not found then raise exception 'SOURCE_CHANGED'; end if;
  end loop;
  result=agent_create_run(p_owner,p_key,p_hash,p_context#>>'{target,text}','{}',p_hash,p_view,p_max_pending,null);
  update agent_runs set kind='career_tailor',career_context=p_context where id=(result->>'runId')::uuid;
  return result;
end $$;
create function public.career_checkpoint(p_run uuid,p_token uuid,p_view jsonb,p_stage integer,p_status text,p_context jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  result=agent_checkpoint(p_run,p_token,p_view,p_stage,p_status);
  update agent_runs set career_context=p_context where id=p_run;
  return result || jsonb_build_object('career_context',p_context);
end $$;
create function public.career_mutate_run(p_owner uuid,p_run uuid,p_kind text,p_key text,p_hash text,p_expected jsonb,p_context jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r agent_runs; op agent_operations; response jsonb;
begin
  select * into r from agent_runs where id=p_run and owner_id=p_owner and kind='career_tailor' for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  select * into op from agent_operations where owner_id=p_owner and scope='career-'||p_kind||':'||p_run::text and key=p_key;
  if found then
    if op.input_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return op.response;
  end if;
  if r.career_context<>p_expected then raise exception 'STATE_CONFLICT'; end if;
  if p_kind='cancel' then
    if r.status in ('completed','failed') then raise exception 'STATE_CONFLICT'; end if;
    update agent_runs set status='failed',finished_at=now(),lease_token=null,lease_expires_at=null,
      career_context=jsonb_set(career_context,'{phase}','"cancelled"'),
      run_view=jsonb_set(jsonb_set(run_view,'{status}','"failed"'),'{error}','{"code":"CANCELLED","message":"任务已取消","retryable":false}') where id=p_run;
  elsif p_kind='retry' then
    if r.career_context->>'phase'='cancelled' then raise exception 'STATE_CONFLICT'; end if;
    perform career_check_sources(p_owner,r.career_context);
    perform agent_mutate_run(p_owner,p_run,'retry',p_key,p_hash,'[]');
  elsif p_kind='selection' then
    if r.status<>'awaiting_input' or r.career_context->>'phase'<>'selection' then raise exception 'STATE_CONFLICT'; end if;
    perform career_check_sources(p_owner,p_context);
    update agent_runs set career_context=p_context,status='queued',stage=1,finished_at=null,
      waiting_ms=waiting_ms+greatest(0,(extract(epoch from(now()-awaiting_since))*1000)::bigint),awaiting_since=null,
      run_view=jsonb_set(run_view,'{status}','"queued"') where id=p_run;
  else raise exception 'STATE_CONFLICT'; end if;
  select jsonb_build_object('runId',id,'status',status) into response from agent_runs where id=p_run;
  insert into agent_operations(owner_id,scope,key,input_hash,run_id,response) values(p_owner,'career-'||p_kind||':'||p_run::text,p_key,p_hash,p_run,response);
  return response;
end $$;

-- Atomic version creation: a network retry must not duplicate the cloud resume.
create function public.career_save_version(p_owner uuid,p_key text,p_hash text,p_title text,p_data jsonb,p_context jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; old_hash text; new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,27));
  select input_hash,jsonb_build_object('id',resume_id) into old_hash,result from career_version_operations where owner_id=p_owner and key=p_key;
  if found then
    if old_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return result;
  end if;
  perform career_check_sources(p_owner,p_context);
  insert into resumes(user_id,title,data) values(p_owner,p_title,p_data) returning id into new_id;
  insert into career_version_operations(owner_id,key,input_hash,resume_id) values(p_owner,p_key,p_hash,new_id);
  return jsonb_build_object('id',new_id);
end $$;

revoke all on function public.career_list_entries(uuid),public.career_save_entry(uuid,jsonb,integer,boolean),public.career_check_sources(uuid,jsonb),public.career_create_run(uuid,text,text,jsonb,jsonb,integer),public.career_checkpoint(uuid,uuid,jsonb,integer,text,jsonb),public.career_mutate_run(uuid,uuid,text,text,text,jsonb,jsonb),public.career_save_version(uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.career_list_entries(uuid),public.career_save_entry(uuid,jsonb,integer,boolean),public.career_check_sources(uuid,jsonb),public.career_create_run(uuid,text,text,jsonb,jsonb,integer),public.career_checkpoint(uuid,uuid,jsonb,integer,text,jsonb),public.career_mutate_run(uuid,uuid,text,text,text,jsonb,jsonb),public.career_save_version(uuid,text,text,text,jsonb,jsonb) to service_role;
commit;
