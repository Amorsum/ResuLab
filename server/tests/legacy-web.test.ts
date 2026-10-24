import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('legacy web migration is repeatable; cloud resumes are owner-only and billing tables service-only', async () => {
  const db = new PGlite();
  const alice = '00000000-0000-4000-8000-00000000000a';
  const bob = '00000000-0000-4000-8000-00000000000b';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema auth to authenticated;
      insert into auth.users values('${alice}'),('${bob}');`);
    const sql = await readFile(new URL('../../supabase/migrations/202610240002_legacy_web.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false);`);
    const inserted = await db.query<{ id: string }>(`insert into public.resumes(user_id,title,data) values($1,'synthetic','{}') returning id`, [alice]);
    const id = inserted.rows[0].id;
    await db.query(`update public.resumes set title='updated' where id=$1`, [id]);
    assert.equal((await db.query(`select * from public.resumes`)).rows.length, 1);
    await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false);`);
    assert.equal((await db.query(`select * from public.resumes`)).rows.length, 0);
    await db.query(`delete from public.resumes where id=$1`, [id]);
    await assert.rejects(db.query(`insert into public.resumes(user_id,data) values($1,'{}')`, [alice]));
    await assert.rejects(db.query(`insert into public.memberships(user_id,tier) values($1,'pro')`, [bob]));
    await assert.rejects(db.query(`insert into public.ai_usage_logs(user_id,feature) values($1,'polish')`, [bob]));
    await db.exec('reset role; set role service_role;');
    await db.query(`insert into public.memberships(user_id) values($1)`, [alice]);
    await db.query(`insert into public.ai_usage_logs(user_id,feature) values($1,'polish')`, [alice]);
    assert.equal((await db.query(`select * from public.resumes`)).rows.length, 1);
    assert.equal((await db.query(`select * from public.ai_usage_logs`)).rows.length, 1);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.resumes'));
    await assert.rejects(db.query('select * from public.memberships'));
  } finally {
    await db.close();
  }
});
