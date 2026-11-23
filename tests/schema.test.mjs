// Checks the database schema and security rules against an in-memory Postgres.
// Run with: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create role authenticated;
grant usage on schema public, auth to authenticated;
grant execute on all functions in schema auth to authenticated;
`);
for (const f of fs.readdirSync('supabase/migrations').sort()) await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated;`);
const U = { a:'00000000-0000-0000-0000-00000000000a', b:'00000000-0000-0000-0000-00000000000b', c:'00000000-0000-0000-0000-00000000000c', d:'00000000-0000-0000-0000-00000000000d' };
for (const [n,id] of Object.entries(U)) await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [id, n+'@x.com', {full_name: n.toUpperCase()}]);
let pass=0, fail=0;
async function as(user, sql, params=[]) {
  await db.exec(`reset role; select set_config('request.jwt.sub', '${user}', false); set role authenticated;`);
  try { const r = await db.query(sql, params); return r.rows; } finally { await db.exec('reset role'); }
}
async function expect(name, fn, check) {
  try { const r = await fn(); if (check(r)) { pass++; } else { fail++; console.log('FAIL', name, JSON.stringify(r)); } }
  catch (e) { if (check(e)) pass++; else { fail++; console.log('FAIL', name, e.message); } }
}
const isErr = (e) => e instanceof Error;
const ok = (r) => !(r instanceof Error);
const len = (n) => (r) => Array.isArray(r) && r.length === n;

// a creates company, becomes admin
const [co] = await as(U.a, `insert into companies (name) values ('Acme Films') returning id`);
const cid = co.id;
await expect('creator is admin', () => as(U.a, `select is_admin from company_members where company_id=$1`, [cid]), r => r[0]?.is_admin === true);
await expect('b cannot see company', () => as(U.b, `select * from companies`), len(0));
await expect('b cannot add self', () => as(U.b, `insert into company_members (company_id,user_id) values ($1,$2)`, [cid,U.b]), isErr);
await expect('a adds b,c,d', () => as(U.a, `insert into company_members (company_id,user_id) values ($1,$2),($1,$3),($1,$4)`, [cid,U.b,U.c,U.d]), ok);
await expect('b sees company', () => as(U.b, `select * from companies`), len(1));
await expect('b sees profiles of company', () => as(U.b, `select * from profiles`), len(4));
await expect('standard roles visible', () => as(U.b, `select * from roles where company_id is null`), r => r.length === 32);
await expect('b non-admin cannot create role', () => as(U.b, `insert into roles (company_id,name) values ($1,'Drone Pilot')`, [cid]), isErr);
await expect('a creates custom role', () => as(U.a, `insert into roles (company_id,name) values ($1,'Drone Pilot')`, [cid]), ok);
await expect('cannot edit standard role', () => as(U.a, `update roles set name='X' where company_id is null returning id`), len(0));
await expect('b non-admin cannot create project', () => as(U.b, `insert into projects (company_id,name) values ($1,'Nope')`, [cid]), isErr);
const [pr] = await as(U.a, `insert into projects (company_id,name) values ($1,'Night Shoot') returning id`, [cid]);
const pid = pr.id;
await expect('b cannot see project before assignment', () => as(U.b, `select * from projects`), len(0));
await expect('assign b,c to project', () => as(U.a, `insert into project_members (project_id,user_id) values ($1,$2),($1,$3)`, [pid,U.b,U.c]), ok);
const [dir] = await as(U.a, `select id from roles where name='Director'`);
await expect('assign role to b on project', () => as(U.a, `insert into project_member_roles values ($1,$2,$3)`, [pid,U.b,dir.id]), ok);
await expect('b sees project', () => as(U.b, `select * from projects`), len(1));
await expect('d (company, not project) cannot see project', () => as(U.d, `select * from projects`), len(0));
// non-company person
const E='00000000-0000-0000-0000-00000000000e';
await db.query(`insert into auth.users (id,email) values ($1,'e@x.com')`, [E]);
await expect('non company member cannot join project', () => as(U.a, `insert into project_members (project_id,user_id) values ($1,$2)`, [pid,E]), isErr);
// tasks
const [t1] = await as(U.b, `insert into tasks (project_id,title,assignee_id) values ($1,'Scout locations',$2) returning id`, [pid,U.c]);
await expect('subtask', () => as(U.b, `insert into tasks (project_id,parent_id,title) values ($1,$2,'Visit warehouse') returning id`, [pid,t1.id]), len(1));
const [sub] = await as(U.b, `select id from tasks where parent_id=$1`, [t1.id]);
await expect('no loops', () => as(U.b, `update tasks set parent_id=$1 where id=$2`, [sub.id,t1.id]), isErr);
await expect('cannot assign to non-project person', () => as(U.b, `insert into tasks (project_id,title,assignee_id) values ($1,'X',$2)`, [pid,U.d]), isErr);
await expect('d cannot see tasks', () => as(U.d, `select * from tasks`), len(0));
await expect('admin a sees tasks', () => as(U.a, `select * from tasks`), len(2));
// journal
const [priv] = await as(U.b, `insert into journal_entries (project_id,body) values ($1,'private thoughts') returning id`, [pid]);
await as(U.b, `insert into journal_entries (project_id,body,visibility) values ($1,'day 1 wrap','public')`, [pid]);
await expect('c sees only public', () => as(U.c, `select body from journal_entries`), r => r.length===1 && r[0].body==='day 1 wrap');
await expect('admin a sees only public', () => as(U.a, `select body from journal_entries`), len(1));
await expect('d sees none', () => as(U.d, `select body from journal_entries`), len(0));
await expect('c cannot share b entry', () => as(U.c, `insert into journal_entry_shares (entry_id,user_id) values ($1,$2)`, [priv.id,U.c]), isErr);
await expect('b cannot share with non-project d', () => as(U.b, `insert into journal_entry_shares (entry_id,user_id) values ($1,$2)`, [priv.id,U.d]), isErr);
await expect('b shares with c', () => as(U.b, `insert into journal_entry_shares (entry_id,user_id) values ($1,$2)`, [priv.id,U.c]), ok);
await expect('c now sees both', () => as(U.c, `select body from journal_entries`), len(2));
await expect('c cannot edit b entry', () => as(U.c, `update journal_entries set body='hack' returning id`), len(0));
await expect('b sees both', () => as(U.b, `select * from journal_entries`), len(2));
// admin rules
await expect('last admin cannot be demoted', () => as(U.a, `update company_members set is_admin=false where user_id=$1`, [U.a]), isErr);
await expect('removing c from company removes from project', async () => { await as(U.a, `delete from company_members where user_id=$1`, [U.c]); return as(U.a, `select * from project_members where user_id=$1`, [U.c]); }, len(0));
await expect('c lost shared entry', () => as(U.c, `select * from journal_entries`), len(0));
await expect('company delete cascades', async () => { await as(U.a, `delete from companies where id=$1`, [cid]); return as(U.a, `select * from projects`); }, len(0));
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
