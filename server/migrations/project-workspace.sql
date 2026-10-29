-- Local project workspace. Applied by dev:career only; never auto-run on Supabase.
begin;
create table if not exists public.career_project_entities (
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('material','session')), id uuid not null,
 revision integer not null, payload jsonb not null, primary key(owner_id,kind,id)
);
create table if not exists public.career_project_operations (
 owner_id uuid not null references auth.users(id) on delete cascade,
 key text not null, input_hash text not null, response jsonb not null, primary key(owner_id,key)
);
alter table career_project_entities enable row level security;
alter table career_project_operations enable row level security;
revoke all on career_project_entities,career_project_operations from public,anon,authenticated;
grant all on career_project_entities,career_project_operations to service_role;
alter table agent_runs add column if not exists kind text not null default 'resume_optimize';
alter table agent_runs drop constraint if exists agent_runs_kind_check;
alter table agent_runs add constraint agent_runs_kind_check check(kind in ('resume_optimize','career_tailor','project_analysis'));
alter table agent_runs add column if not exists project_context jsonb;

create or replace function career_project_get(p_owner uuid,p_kind text,p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb; begin
 select payload into v from career_project_entities where owner_id=p_owner and kind=p_kind and id=p_id;
 if not found then raise exception 'ENTRY_NOT_FOUND'; end if; return v;
end $$;
create or replace function career_project_list(p_owner uuid,p_kind text) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(payload order by (payload->>'updatedAt')::bigint desc nulls last),'[]') from career_project_entities where owner_id=p_owner and kind=p_kind;
$$;
create or replace function career_project_material_count(p_owner uuid) returns integer language sql security definer set search_path=public,pg_temp as $$
 select count(*)::integer from career_project_entities where owner_id=p_owner and kind='material' and coalesce((payload->>'deleted')::boolean,false)=false;
$$;
revoke all on function career_project_material_count(uuid) from public,anon,authenticated;
grant execute on function career_project_material_count(uuid) to service_role;
create or replace function career_project_unattached_materials(p_owner uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.payload->>'name','source',m.payload->>'source','createdAt',m.payload->'createdAt')),'[]')
 from career_project_entities m where m.owner_id=p_owner and m.kind='material' and coalesce((m.payload->>'deleted')::boolean,false)=false
 and not exists(select 1 from career_project_entities s where s.owner_id=p_owner and s.kind='session' and s.payload->>'materialId'=m.id::text);
$$;
revoke all on function career_project_unattached_materials(uuid) from public,anon,authenticated;
grant execute on function career_project_unattached_materials(uuid) to service_role;
create or replace function career_project_put(p_owner uuid,p_kind text,p_id uuid,p_payload jsonb,p_expected integer,p_key text,p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op career_project_operations; r career_project_entities; v jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,31));
 select * into op from career_project_operations where owner_id=p_owner and key=p_key;
 if found then if op.input_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return op.response; end if;
 select * into r from career_project_entities where owner_id=p_owner and kind=p_kind and id=p_id for update;
 if coalesce(r.revision,0)<>p_expected then raise exception 'REVISION_CONFLICT'; end if;
 if p_kind='session' and exists(select 1 from agent_runs where owner_id=p_owner and kind='project_analysis' and project_context->>'sessionId'=p_id::text and status in ('queued','running')) then raise exception 'STATE_CONFLICT'; end if;
 v=p_payload||jsonb_build_object('id',p_id,'revision',p_expected+1,'updatedAt',(extract(epoch from clock_timestamp())*1000)::bigint);
 insert into career_project_entities values(p_owner,p_kind,p_id,p_expected+1,v) on conflict(owner_id,kind,id) do update set revision=excluded.revision,payload=excluded.payload;
 insert into career_project_operations values(p_owner,p_key,p_hash,v); return v;
end $$;
create or replace function career_project_enqueue(p_owner uuid,p_session uuid,p_expected integer,p_key text,p_hash text,p_context jsonb,p_view jsonb,p_max_pending integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op career_project_operations; e career_project_entities; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,31));
 select * into op from career_project_operations where owner_id=p_owner and key=p_key;
 if found then if op.input_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return op.response; end if;
 select * into e from career_project_entities where owner_id=p_owner and kind='session' and id=p_session for update;
 if not found then raise exception 'ENTRY_NOT_FOUND'; end if;
 if e.revision<>p_expected then raise exception 'REVISION_CONFLICT'; end if;
 if e.payload->>'status' in ('queued','running') then raise exception 'STATE_CONFLICT'; end if;
 result=agent_create_run(p_owner,p_key,p_hash,'项目材料分析','{}',p_hash,p_view,p_max_pending,null);
 update agent_runs set kind='project_analysis',project_context=p_context where id=(result->>'runId')::uuid;
 update career_project_entities set payload=payload||jsonb_build_object('status','queued','runId',result->>'runId','error',null) where owner_id=p_owner and kind='session' and id=p_session;
 insert into career_project_operations values(p_owner,p_key,p_hash,result); return result;
end $$;
create or replace function career_project_checkpoint(p_run uuid,p_token uuid,p_view jsonb,p_stage integer,p_status text,p_context jsonb,p_session jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r agent_runs; result jsonb; e career_project_entities;
begin
 select * into r from agent_runs where id=p_run for update;
 result=agent_checkpoint(p_run,p_token,p_view,p_stage,p_status);
 select * into e from career_project_entities where owner_id=r.owner_id and kind='session' and id=(p_context->>'sessionId')::uuid for update;
 if e.revision<>(p_context->>'sessionRevision')::integer then raise exception 'REVISION_CONFLICT'; end if;
 update agent_runs set project_context=p_context where id=p_run;
 update career_project_entities set revision=e.revision+case when p_status in ('completed','failed') then 1 else 0 end,payload=p_session||jsonb_build_object('revision',e.revision+case when p_status in ('completed','failed') then 1 else 0 end,'runId',p_run,'updatedAt',(extract(epoch from clock_timestamp())*1000)::bigint) where owner_id=r.owner_id and kind='session' and id=e.id;
 return result||jsonb_build_object('project_context',p_context);
end $$;
create or replace function career_project_cancel(p_owner uuid,p_session uuid,p_expected integer,p_key text,p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e career_project_entities; op career_project_operations; v jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,31));
 select * into op from career_project_operations where owner_id=p_owner and key=p_key;
 if found then if op.input_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return op.response; end if;
 -- Same lock order as checkpoint: run, then session.
 perform 1 from agent_runs where owner_id=p_owner and project_context->>'sessionId'=p_session::text for update;
 select * into e from career_project_entities where owner_id=p_owner and kind='session' and id=p_session for update;
 if not found then raise exception 'ENTRY_NOT_FOUND'; end if;
 if e.revision<>p_expected then raise exception 'REVISION_CONFLICT'; end if;
 update agent_runs set status='failed',finished_at=now(),lease_token=null,lease_expires_at=null where owner_id=p_owner and kind='project_analysis' and project_context->>'sessionId'=p_session::text and status in ('queued','running');
 v=e.payload||jsonb_build_object('status','idle','error','已停止，材料和已完成结果已保留','revision',e.revision+1);
 update career_project_entities set revision=e.revision+1,payload=v where owner_id=p_owner and kind='session' and id=p_session;
 insert into career_project_operations values(p_owner,p_key,p_hash,v); return v;
end $$;
revoke all on function career_project_get(uuid,text,uuid),career_project_list(uuid,text),career_project_put(uuid,text,uuid,jsonb,integer,text,text),career_project_enqueue(uuid,uuid,integer,text,text,jsonb,jsonb,integer),career_project_checkpoint(uuid,uuid,jsonb,integer,text,jsonb,jsonb),career_project_cancel(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function career_project_get(uuid,text,uuid),career_project_list(uuid,text),career_project_put(uuid,text,uuid,jsonb,integer,text,text),career_project_enqueue(uuid,uuid,integer,text,text,jsonb,jsonb,integer),career_project_checkpoint(uuid,uuid,jsonb,integer,text,jsonb,jsonb),career_project_cancel(uuid,uuid,integer,text,text) to service_role;
create or replace function career_project_delete_material(p_owner uuid,p_material uuid,p_key text,p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op career_project_operations; e career_project_entities; v jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,31));
 select * into op from career_project_operations where owner_id=p_owner and key=p_key;
 if found then if op.input_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return op.response; end if;
 perform 1 from career_project_entities where owner_id=p_owner and kind='material' and id=p_material;
 if not found then raise exception 'ENTRY_NOT_FOUND'; end if;
 perform 1 from agent_runs where owner_id=p_owner and kind='project_analysis' and project_context->>'sessionId' in (select id::text from career_project_entities where owner_id=p_owner and kind='session' and payload->>'materialId'=p_material::text) for update;
 update agent_runs set project_context=jsonb_set(project_context,'{partials}','[]'),status=case when status in ('queued','running') then 'failed' else status end,lease_token=null,lease_expires_at=null where owner_id=p_owner and kind='project_analysis' and project_context->>'sessionId' in (select id::text from career_project_entities where owner_id=p_owner and kind='session' and payload->>'materialId'=p_material::text);
 for e in select * from career_project_entities where owner_id=p_owner and kind='session' and payload->>'materialId'=p_material::text for update loop
  v=e.payload||jsonb_build_object('materialDeleted',true,'status','idle','revision',e.revision+1,'evidence','[]'::jsonb);
  if v ? 'understanding' then v=jsonb_set(v,'{understanding,findings}','[]'); end if;
  update career_project_entities set revision=e.revision+1,payload=v where owner_id=p_owner and kind='session' and id=e.id;
 end loop;
 update career_project_entities set revision=revision+1,payload=payload||'{"files":[],"deleted":true}' where owner_id=p_owner and kind='material' and id=p_material;
 -- Remove historical operation responses that retained material text or source quotations.
 delete from career_project_operations where owner_id=p_owner and (response->>'id'=p_material::text or response->>'materialId'=p_material::text or response#>>'{session,materialId}'=p_material::text);
 insert into career_project_operations values(p_owner,p_key,p_hash,'{"deleted":true}'); return '{"deleted":true}';
end $$;
revoke all on function career_project_delete_material(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function career_project_delete_material(uuid,uuid,text,text) to service_role;
create or replace function career_project_confirm(p_owner uuid,p_session uuid,p_expected integer,p_entry jsonb,p_key text,p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op career_project_operations; e career_project_entities; saved jsonb; v jsonb; response jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,31));
 select * into op from career_project_operations where owner_id=p_owner and key=p_key;
 if found then if op.input_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return op.response; end if;
 select * into e from career_project_entities where owner_id=p_owner and kind='session' and id=p_session for update;
 if not found then raise exception 'ENTRY_NOT_FOUND'; end if;
 if e.revision<>p_expected or e.payload->>'status' in ('queued','running') then raise exception 'REVISION_CONFLICT'; end if;
 saved=career_save_entry(p_owner,p_entry,coalesce((e.payload->>'savedEntryRevision')::integer,0),true);
 v=e.payload||jsonb_build_object('revision',e.revision+1,'savedEntryRevision',saved->'revision');
 update career_project_entities set revision=e.revision+1,payload=v where owner_id=p_owner and kind='session' and id=p_session;
 response=jsonb_build_object('session',v,'entry',saved);
 insert into career_project_operations values(p_owner,p_key,p_hash,response); return response;
end $$;
revoke all on function career_project_confirm(uuid,uuid,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function career_project_confirm(uuid,uuid,integer,jsonb,text,text) to service_role;
create or replace function career_project_operation_get(p_owner uuid,p_key text) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select response from career_project_operations where owner_id=p_owner and key=p_key;
$$;
revoke all on function career_project_operation_get(uuid,text) from public,anon,authenticated;
grant execute on function career_project_operation_get(uuid,text) to service_role;
create or replace function career_project_replay(p_owner uuid,p_key text,p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op career_project_operations; begin
 select * into op from career_project_operations where owner_id=p_owner and key=p_key;
 if not found then return null; end if;
 if op.input_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return op.response;
end $$;
revoke all on function career_project_replay(uuid,text,text) from public,anon,authenticated;
grant execute on function career_project_replay(uuid,text,text) to service_role;
create or replace function career_list_versions(p_owner uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(v),'[]') from (select jsonb_build_object('id',id,'title',title,'updatedAt',updated_at,'documentMeta',data->'documentMeta') v from resumes where user_id=p_owner order by updated_at desc limit 100) recent;
$$;
revoke all on function career_list_versions(uuid) from public,anon,authenticated;
grant execute on function career_list_versions(uuid) to service_role;
commit;
