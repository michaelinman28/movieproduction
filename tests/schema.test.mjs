// Checks the database schema and security rules against an in-memory Postgres.
// Run with: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz default now());
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid, user_agent text, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create role authenticated;
create role anon;
grant usage on schema public, auth to authenticated;
grant execute on all functions in schema auth to authenticated;
`);
for (const f of fs.readdirSync('supabase/migrations').sort()) await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated; select public.hide_share_token();`);
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
await expect("c's task became unassigned", () => as(U.a, `select assignee_id from tasks where id=$1`, [t1.id]), r => r[0]?.assignee_id === null);
await expect('unassigned task can still be edited', () => as(U.b, `update tasks set status='done' where id=$1 returning id`, [t1.id]), len(1));
await expect('c lost shared entry', () => as(U.c, `select * from journal_entries`), len(0));
await expect('company delete cascades', async () => { await as(U.a, `delete from companies where id=$1`, [cid]); return as(U.a, `select * from projects`); }, len(0));
// step 2: adding people by email
const [co2] = await as(U.a, `insert into companies (name) values ('Second Unit') returning id`);
const c2 = co2.id;
await expect('non-admin cannot add by email', () => as(U.b, `select add_company_member($1,'d@x.com')`, [c2]), isErr);
await expect('add existing user by email', () => as(U.a, `select add_company_member($1,' B@X.com ', false, 'Line Producer') r`, [c2]), r => r[0].r === 'added');
await expect('b is member with title', () => as(U.b, `select title from company_members where company_id=$1 and user_id=$2`, [c2,U.b]), r => r[0]?.title === 'Line Producer');
await expect('adding again says already member', () => as(U.a, `select add_company_member($1,'b@x.com') r`, [c2]), r => r[0].r === 'already_member');
await expect('unknown email rejected', () => as(U.a, `select add_company_member($1,'nobody@x.com')`, [c2]), e => isErr(e) && /Add their name too/.test(e.message));
await expect('bad email rejected', () => as(U.a, `select add_company_member($1,'nope')`, [c2]), isErr);
const N='00000000-0000-0000-0000-0000000000ff';
await db.query(`insert into auth.users (id,email,email_confirmed_at) values ($1,'new@x.com',null)`, [N]);
await expect('unconfirmed account cannot be added', () => as(U.a, `select add_company_member($1,'new@x.com')`, [c2]), isErr);
await db.query(`update auth.users set email_confirmed_at=now() where id=$1`, [N]);
await expect('confirmed account added as admin', () => as(U.a, `select add_company_member($1,'new@x.com', true) r`, [c2]), r => r[0].r === 'added');
await db.query(`update auth.users set email='renamed@x.com' where id=$1`, [N]);
await expect('profile email follows sign-in email', () => as(U.a, `select email from profiles where id=$1`, [N]), r => r[0]?.email === 'renamed@x.com');
// phone numbers
const P='00000000-0000-0000-0000-0000000000dd';
await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'p@x.com',$2)`, [P, {full_name:'P', phone:' 404 555 0100 '}]);
await expect('phone from sign-up', () => as(P, `select phone from profiles where id=$1`, [P]), r => r[0]?.phone === '404-555-0100');
await expect('edit own phone', () => as(U.b, `update profiles set phone='4045550199' where id=$1 returning phone`, [U.b]), len(1));
await expect('cannot edit others phone', () => as(U.b, `update profiles set phone='4045550111' where id=$1 returning id`, [U.a]), len(0));
await expect('co-member sees phone', () => as(U.a, `select phone from profiles where id=$1`, [U.b]), r => r[0]?.phone === '404-555-0199');
// step 3: custom roles
const [co3] = await as(U.a, `insert into companies (name) values ('Third Co') returning id`);
const c3 = co3.id;
await as(U.a, `select add_company_member($1,'b@x.com')`, [c3]);
await expect('admin adds custom role (trimmed)', () => as(U.a, `insert into roles (company_id,name,department) values ($1,'  Intimacy Coordinator ','  ') returning name, department`, [c3]), r => r[0]?.name === 'Intimacy Coordinator' && r[0]?.department === null);
await expect('custom role cannot copy a standard name', () => as(U.a, `insert into roles (company_id,name) values ($1,'director')`, [c3]), e => isErr(e) && /standard role/.test(e.message));
await expect('cannot rename custom role to a standard name', () => as(U.a, `update roles set name='Gaffer' where company_id=$1`, [c3]), isErr);
await expect('duplicate custom name rejected', () => as(U.a, `insert into roles (company_id,name) values ($1,'intimacy coordinator')`, [c3]), isErr);
await expect('other company can reuse the custom name', () => as(U.a, `insert into roles (company_id,name) values ($1,'Intimacy Coordinator') returning id`, [c2]), len(1));
await expect('non-admin cannot add custom role', () => as(U.b, `insert into roles (company_id,name) values ($1,'Nope')`, [c3]), isErr);
const [ic] = await as(U.a, `select id from roles where company_id=$1`, [c3]);
await as(U.a, `insert into company_member_roles values ($1,$2,$3)`, [c3, U.b, ic.id]);
await expect('role usage counts people', () => as(U.b, `select people from role_usage($1) where role_id=$2`, [c3, ic.id]), r => Number(r[0]?.people) === 1);
await expect('outsider sees no usage', () => as(U.d, `select * from role_usage($1)`, [c3]), len(0));
await expect('non-admin cannot delete custom role', () => as(U.b, `delete from roles where id=$1 returning id`, [ic.id]), len(0));
await expect('admin deletes custom role, assignments go too', async () => { await as(U.a, `delete from roles where id=$1`, [ic.id]); return as(U.a, `select * from company_member_roles where company_id=$1`, [c3]); }, len(0));
// step 4: tasks
const [co4] = await as(U.a, `insert into companies (name) values ('Task Co') returning id`);
await as(U.a, `insert into company_members (company_id,user_id) values ($1,$2),($1,$3)`, [co4.id,U.b,U.d]);
const [p4] = await as(U.a, `insert into projects (company_id,name) values ($1,'Tasks Film') returning id`, [co4.id]);
await as(U.a, `insert into project_members (project_id,user_id) values ($1,$2)`, [p4.id,U.b]);
const [p4b] = await as(U.a, `insert into projects (company_id,name) values ($1,'Other Film') returning id`, [co4.id]);
const [tk] = await as(U.b, `insert into tasks (project_id,title,description) values ($1,'  Book crew  ','  ') returning *`, [p4.id]);
await expect('title trimmed, blank description is null', () => Promise.resolve([tk]), r => r[0].title === 'Book crew' && r[0].description === null);
await expect('blank title refused', () => as(U.b, `insert into tasks (project_id,title) values ($1,'   ')`, [p4.id]), isErr);
await expect('project member creates sub-task', () => as(U.b, `insert into tasks (project_id,parent_id,title) values ($1,$2,'Call gaffer') returning id`, [p4.id,tk.id]), len(1));
await expect('sub-task must stay in the parent project', () => as(U.a, `insert into tasks (project_id,parent_id,title) values ($1,$2,'Wrong')`, [p4b.id,tk.id]), isErr);
await expect('company member off the project cannot add tasks', () => as(U.d, `insert into tasks (project_id,title) values ($1,'Sneaky')`, [p4.id]), isErr);
await expect('company member off the project cannot edit tasks', () => as(U.d, `update tasks set title='X' where id=$1 returning id`, [tk.id]), len(0));
await expect('admin off the project can edit tasks', () => as(U.a, `update tasks set priority='high' where id=$1 returning id`, [tk.id]), len(1));
await expect('assign to project member', () => as(U.b, `update tasks set assignee_id=$1 where id=$2 returning id`, [U.b,tk.id]), len(1));
await expect('deleting a task deletes its sub-tasks', async () => { await as(U.b, `delete from tasks where id=$1`, [tk.id]); return as(U.b, `select * from tasks where project_id=$1`, [p4.id]); }, len(0));
// due times
const [dt] = await as(U.b, `insert into tasks (project_id,title,due_date,due_part) values ($1,'Load in','2027-01-10','morning') returning *`, [p4.id]);
await expect('task due in the morning', () => Promise.resolve([dt]), r => r[0].due_part === 'morning' && r[0].due_time === null);
await expect('exact due time', () => as(U.b, `update tasks set due_part=null, due_time='14:30' where id=$1 returning due_time`, [dt.id]), r => r[0]?.due_time === '14:30:00');
await expect('not both a part of day and a time', () => as(U.b, `update tasks set due_part='evening' where id=$1`, [dt.id]), isErr);
await expect('a time needs a date', () => as(U.b, `update tasks set due_date=null where id=$1`, [dt.id]), isErr);
await expect('bad part of day refused', () => as(U.b, `update tasks set due_time=null, due_part='night' where id=$1`, [dt.id]), isErr);
// task notes
const [nt] = await as(U.b, `insert into tasks (project_id,title) values ($1,'Noted task') returning id`, [p4.id]);
const [note] = await as(U.b, `insert into task_notes (task_id,body) values ($1,'  Called the venue  ') returning *`, [nt.id]);
await expect('note stored trimmed with author', () => Promise.resolve([note]), r => r[0].body === 'Called the venue' && r[0].author_id === U.b);
await expect('many notes per task', () => as(U.b, `insert into task_notes (task_id,body) values ($1,'Second note') returning id`, [nt.id]), len(1));
await expect('blank note refused', () => as(U.b, `insert into task_notes (task_id,body) values ($1,'  ')`, [nt.id]), isErr);
await expect('cannot post as someone else', () => as(U.b, `insert into task_notes (task_id,body,author_id) values ($1,'x',$2)`, [nt.id,U.a]), isErr);
await expect('off-project member cannot read notes', () => as(U.d, `select * from task_notes`), len(0));
await expect('off-project member cannot add notes', () => as(U.d, `insert into task_notes (task_id,body) values ($1,'x')`, [nt.id]), isErr);
await expect('admin reads notes', () => as(U.a, `select * from task_notes where task_id=$1`, [nt.id]), len(2));
await expect('only the author edits a note', () => as(U.a, `update task_notes set body='hack' where id=$1 returning id`, [note.id]), len(0));
await expect('author edits own note', () => as(U.b, `update task_notes set body='Venue confirmed' where id=$1 returning body`, [note.id]), r => r[0]?.body === 'Venue confirmed');
await expect('admin can delete a note', () => as(U.a, `delete from task_notes where id=$1 returning id`, [note.id]), len(1));
await expect('deleting the task deletes its notes', async () => { await as(U.b, `delete from tasks where id=$1`, [nt.id]); return as(U.a, `select * from task_notes`); }, len(0));
// task categories and tags
const [cc] = await as(U.a, `insert into companies (name) values ('Label Co') returning id`);
await as(U.a, `insert into company_members (company_id,user_id) values ($1,$2),($1,$3)`, [cc.id,U.b,U.d]);
const [pc] = await as(U.a, `insert into projects (company_id,name) values ($1,'Label Film') returning id`, [cc.id]);
await as(U.a, `insert into project_members (project_id,user_id) values ($1,$2)`, [pc.id,U.b]);
await expect('new company gets starter categories', () => as(U.b, `select name from task_categories where company_id=$1 order by sort_order`, [cc.id]), r => r.length === 12 && r[1].name === 'Casting');
await expect('non-admin cannot add a category', () => as(U.b, `insert into task_categories (company_id,name) values ($1,'Stunts')`, [cc.id]), isErr);
const [cat] = await as(U.a, `insert into task_categories (company_id,name) values ($1,' Stunts ') returning *`, [cc.id]);
await expect('admin adds a category, trimmed', () => Promise.resolve([cat]), r => r[0].name === 'Stunts');
await expect('duplicate category name refused', () => as(U.a, `insert into task_categories (company_id,name) values ($1,'stunts')`, [cc.id]), isErr);
await expect('other company cannot see categories', () => as(U.c, `select * from task_categories where company_id=$1`, [cc.id]), len(0));
const [ct] = await as(U.b, `insert into tasks (project_id,title,category_id) values ($1,'Rig the fall',$2) returning *`, [pc.id,cat.id]);
await expect('task gets a category', () => Promise.resolve([ct]), r => r[0].category_id === cat.id);
const [otherCat] = await as(U.a, `select id from task_categories where company_id=$1 limit 1`, [c3]);
await expect('category from another company refused', () => as(U.b, `update tasks set category_id=$1 where id=$2`, [otherCat.id,ct.id]), isErr);
const [tag] = await as(U.b, `insert into task_tags (company_id,name) values ($1,'night') returning *`, [cc.id]);
await expect('member creates a tag on the fly', () => Promise.resolve([tag]), r => r[0].name === 'night');
await expect('duplicate tag refused', () => as(U.b, `insert into task_tags (company_id,name) values ($1,'NIGHT')`, [cc.id]), isErr);
await expect('outsider cannot create a tag', () => as(U.c, `insert into task_tags (company_id,name) values ($1,'x')`, [cc.id]), isErr);
await expect('tag a task', () => as(U.b, `insert into task_tag_links (task_id,tag_id) values ($1,$2) returning tag_id`, [ct.id,tag.id]), len(1));
const [otherTag] = await as(U.a, `insert into task_tags (company_id,name) values ($1,'elsewhere') returning id`, [c3]);
await expect('tag from another company refused', () => as(U.b, `insert into task_tag_links (task_id,tag_id) values ($1,$2)`, [ct.id,otherTag.id]), isErr);
await expect('off-project member cannot tag', () => as(U.d, `delete from task_tag_links where task_id=$1 returning tag_id`, [ct.id]), len(0));
await expect('non-admin cannot rename a tag', () => as(U.b, `update task_tags set name='x' where id=$1 returning id`, [tag.id]), len(0));
await expect('usage counts', () => as(U.b, `select * from task_label_usage($1) where tasks > 0`, [cc.id]), r => r.length === 2);
await expect('deleting a category clears it from tasks', async () => { await as(U.a, `delete from task_categories where id=$1`, [cat.id]); return as(U.b, `select category_id from tasks where id=$1`, [ct.id]); }, r => r[0]?.category_id === null);
await expect('deleting a tag removes it from tasks', async () => { await as(U.a, `delete from task_tags where id=$1`, [tag.id]); return as(U.b, `select * from task_tag_links where task_id=$1`, [ct.id]); }, len(0));
// project locations
const [lp] = await as(U.a, `insert into projects (company_id,name) values ($1,'Location Film') returning id`, [cc.id]);
await as(U.a, `insert into project_members (project_id,user_id) values ($1,$2)`, [lp.id,U.b]);
const [loc] = await as(U.b, `insert into project_locations (project_id,name,address,contact_name,contact_email,contact_phone) values ($1,' Old Mill ',' 1 Mill Rd ','Sam','  SAM@Mill.com ','') returning *`, [lp.id]);
await expect('member adds a location, tidied', () => Promise.resolve([loc]), r => r[0].name === 'Old Mill' && r[0].address === '1 Mill Rd' && r[0].contact_email === 'sam@mill.com' && r[0].contact_phone === null && r[0].created_by === U.b);
await expect('blank location name refused', () => as(U.b, `insert into project_locations (project_id,name) values ($1,'  ')`, [lp.id]), isErr);
await expect('duplicate location name refused', () => as(U.b, `insert into project_locations (project_id,name) values ($1,'old mill')`, [lp.id]), isErr);
await expect('bad contact email refused', () => as(U.b, `update project_locations set contact_email='nope' where id=$1`, [loc.id]), isErr);
await expect('off-project member cannot see locations', () => as(U.d, `select * from project_locations where project_id=$1`, [lp.id]), len(0));
await expect('off-project member cannot add locations', () => as(U.d, `insert into project_locations (project_id,name) values ($1,'Sneaky')`, [lp.id]), isErr);
await expect('outsider cannot see locations', () => as(U.c, `select * from project_locations`), len(0));
await expect('member edits a location', () => as(U.b, `update project_locations set description='Two floors' where id=$1 returning description`, [loc.id]), r => r[0]?.description === 'Two floors');
const [lt] = await as(U.b, `insert into tasks (project_id,title,location_id) values ($1,'Light the mill',$2) returning *`, [lp.id,loc.id]);
await expect('new location is being considered', () => as(U.b, `select status from project_locations where id=$1`, [loc.id]), r => r[0]?.status === 'considering');
await expect('location marked not using', () => as(U.b, `update project_locations set status='not_using' where id=$1 returning status`, [loc.id]), r => r[0]?.status === 'not_using');
await expect('bad location status refused', () => as(U.b, `update project_locations set status='maybe' where id=$1`, [loc.id]), isErr);
await expect('task assigned to a location', () => Promise.resolve([lt]), r => r[0].location_id === loc.id);
await expect('location from another project refused', () => as(U.b, `insert into tasks (project_id,title,location_id) values ($1,'Wrong place',$2)`, [pc.id,loc.id]), isErr);
const [loc2] = await as(U.a, `insert into project_locations (project_id,name) values ($1,'Studio B') returning id`, [lp.id]);
await expect('only the creator or an admin deletes a location', () => as(U.b, `delete from project_locations where id=$1 returning id`, [loc2.id]), len(0));
await expect('deleting a location clears it from tasks', async () => { await as(U.b, `delete from project_locations where id=$1`, [loc.id]); return as(U.b, `select location_id from tasks where id=$1`, [lt.id]); }, r => r[0]?.location_id === null);
// people's details: admins edit name and phone and add contacts; only you change your email
await expect('admin edits a member name and phone', () => as(U.a, `update profiles set full_name=' Bea B ', phone='(404) 555 0100' where id=$1 returning full_name, phone`, [U.b]), r => r[0]?.full_name === 'Bea B' && r[0]?.phone === '404-555-0100');
await expect('non-admin cannot edit another member', () => as(U.b, `update profiles set full_name='Hacked' where id=$1 returning id`, [U.d]), len(0));
await expect('outsider cannot edit a member', () => as(E, `update profiles set full_name='Hacked' where id=$1 returning id`, [U.b]), len(0));
await expect('admin cannot change a member email', () => as(U.a, `update profiles set email='new@x.com' where id=$1`, [U.b]), isErr);
await expect('you cannot change your profile email directly', () => as(U.b, `update profiles set email='new@x.com' where id=$1`, [U.b]), isErr);
await expect('you edit your own phone', () => as(U.b, `update profiles set phone='+1 404.555.0199' where id=$1 returning phone`, [U.b]), r => r[0]?.phone === '404-555-0199');
await expect('sign-in email change still reaches the profile', async () => { await db.query(`update auth.users set email='b2@x.com' where id=$1`, [U.b]); return as(U.b, `select email from profiles where id=$1`, [U.b]); }, r => r[0]?.email === 'b2@x.com');
const [pc1] = await as(U.a, `insert into person_contacts (user_id,kind,value,label) values ($1,'email','  Bea@Work.COM ',' Work ') returning *`, [U.b]);
await expect('admin adds an email for a member, tidied', () => Promise.resolve([pc1]), r => r[0].value === 'bea@work.com' && r[0].label === 'Work' && r[0].created_by === U.a);
await expect('the person sees their contacts', () => as(U.b, `select * from person_contacts where user_id=$1`, [U.b]), len(1));
await expect('company colleague sees the contacts', () => as(U.d, `select * from person_contacts where user_id=$1`, [U.b]), len(1));
await expect('outsider cannot see the contacts', () => as(E, `select * from person_contacts`), len(0));
await expect('non-admin cannot add contacts for others', () => as(U.d, `insert into person_contacts (user_id,kind,value) values ($1,'phone','404 555 0101')`, [U.b]), isErr);
await expect('you add your own phone', () => as(U.b, `insert into person_contacts (user_id,kind,value,label) values ($1,'phone','404 555 0102','Home') returning id`, [U.b]), len(1));
await expect('bad extra email refused', () => as(U.a, `insert into person_contacts (user_id,kind,value) values ($1,'email','nope')`, [U.b]), isErr);
await expect('duplicate extra contact refused', () => as(U.a, `insert into person_contacts (user_id,kind,value) values ($1,'email','BEA@work.com')`, [U.b]), isErr);
await expect('contact cannot move to another person', () => as(U.a, `update person_contacts set user_id=$1 where id=$2 returning user_id`, [U.d, pc1.id]), r => r[0]?.user_id === U.b);
await expect('non-admin cannot delete others contacts', () => as(U.d, `delete from person_contacts where id=$1 returning id`, [pc1.id]), len(0));
await expect('admin deletes a member contact', () => as(U.a, `delete from person_contacts where id=$1 returning id`, [pc1.id]), len(1));
// nicknames
await expect('admin sets a member nickname, tidied', () => as(U.a, `update profiles set nickname='  Bee ' where id=$1 returning nickname`, [U.b]), r => r[0]?.nickname === 'Bee');
await expect('you set your own nickname', () => as(U.d, `update profiles set nickname='Dee' where id=$1 returning nickname`, [U.d]), r => r[0]?.nickname === 'Dee');
await expect('non-admin cannot set another nickname', () => as(U.d, `update profiles set nickname='X' where id=$1 returning id`, [U.b]), len(0));
await expect('blank nickname is cleared', () => as(U.b, `update profiles set nickname='  ' where id=$1 returning nickname`, [U.b]), r => r[0]?.nickname === null);
await expect('overlong nickname refused', () => as(U.b, `update profiles set nickname=repeat('x', 61) where id=$1`, [U.b]), isErr);
// project roles start as the person's company roles
const [co7] = await as(U.a, `insert into companies (name) values ('Role Copy Co') returning id`);
await as(U.a, `insert into company_members (company_id,user_id) values ($1,$2),($1,$3)`, [co7.id,U.b,U.d]);
const [r7] = await as(U.a, `insert into roles (company_id,name) values ($1,'Boom Op') returning id`, [co7.id]);
const [std] = await as(U.a, `select id from roles where company_id is null order by name limit 1`);
await as(U.a, `insert into company_member_roles (company_id,user_id,role_id) values ($1,$2,$3),($1,$2,$4)`, [co7.id,U.b,r7.id,std.id]);
const [p7] = await as(U.a, `insert into projects (company_id,name) values ($1,'Copy Film') returning id`, [co7.id]);
await as(U.a, `insert into project_members (project_id,user_id) values ($1,$2),($1,$3)`, [p7.id,U.b,U.d]);
await expect('new project member gets their company roles', () => as(U.a, `select role_id from project_member_roles where project_id=$1 and user_id=$2`, [p7.id,U.b]), r => r.length === 2 && r.some(x => x.role_id === r7.id) && r.some(x => x.role_id === std.id));
await expect('member with no company roles starts with none', () => as(U.a, `select * from project_member_roles where project_id=$1 and user_id=$2`, [p7.id,U.d]), len(0));
await expect('project roles can then differ', async () => { await as(U.a, `delete from project_member_roles where project_id=$1 and user_id=$2 and role_id=$3`, [p7.id,U.b,std.id]); return as(U.a, `select * from company_member_roles where company_id=$1 and user_id=$2`, [co7.id,U.b]); }, len(2));
// phone and email formats
await expect('phone digits become ###-###-####', () => as(U.b, `update profiles set phone='404.555.0123' where id=$1 returning phone`, [U.b]), r => r[0]?.phone === '404-555-0123');
await expect('leading 1 dropped', () => as(U.b, `update profiles set phone='1 (404) 555-0124' where id=$1 returning phone`, [U.b]), r => r[0]?.phone === '404-555-0124');
await expect('international kept as + digits', () => as(U.b, `update profiles set phone='+44 20 7946 0958' where id=$1 returning phone`, [U.b]), r => r[0]?.phone === '+442079460958');
await expect('short phone refused', () => as(U.b, `update profiles set phone='555-0100' where id=$1`, [U.b]), isErr);
await expect('letters in phone refused', () => as(U.b, `update profiles set phone='404-CALL-NOW' where id=$1`, [U.b]), isErr);
await expect('blank phone cleared', () => as(U.b, `update profiles set phone='  ' where id=$1 returning phone`, [U.b]), r => r[0]?.phone === null);
await expect('contact phone formatted', () => as(U.b, `insert into person_contacts (user_id,kind,value) values ($1,'phone','4045550177') returning value`, [U.b]), r => r[0]?.value === '404-555-0177');
await expect('contact email without dot refused', () => as(U.b, `insert into person_contacts (user_id,kind,value) values ($1,'email','bea@work')`, [U.b]), isErr);
await expect('contact email with space refused', () => as(U.b, `insert into person_contacts (user_id,kind,value) values ($1,'email','bea smith@work.com')`, [U.b]), isErr);
await expect('contact email double dot refused', () => as(U.b, `insert into person_contacts (user_id,kind,value) values ($1,'email','bea..b@work.com')`, [U.b]), isErr);
await expect('good contact email kept, lowercased', () => as(U.b, `insert into person_contacts (user_id,kind,value) values ($1,'email',' Bea.O''Neil+films@Work.co.uk ') returning value`, [U.b]), r => r[0]?.value === "bea.o'neil+films@work.co.uk");
const [locF] = await as(U.b, `insert into project_locations (project_id,name) values ($1,'Barn') returning id`, [lp.id]);
await expect('location phone formatted', () => as(U.b, `update project_locations set contact_phone='404 555 0188' where id=$1 returning contact_phone`, [locF.id]), r => r[0]?.contact_phone === '404-555-0188');
await expect('location bad phone refused', () => as(U.b, `update project_locations set contact_phone='12345' where id=$1`, [locF.id]), isErr);
await expect('location email without domain ending refused', () => as(U.b, `update project_locations set contact_email='sam@mill.c' where id=$1`, [locF.id]), isErr);
await expect('location edit leaves other fields alone', () => as(U.b, `update project_locations set name='Old Mill 2' where id=$1 returning contact_phone, contact_email`, [locF.id]), r => r[0]?.contact_phone === '404-555-0188' && r[0]?.contact_email === null);
await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'q@x.com',$2)`, ['00000000-0000-0000-0000-0000000000f1', {full_name:'Q', phone:'call me'}]);
await expect('odd sign-up phone does not block sign-up', () => db.query(`select phone from profiles where id='00000000-0000-0000-0000-0000000000f1'`).then(r => r.rows), r => r[0]?.phone === 'call me');
// people without an account yet
const [coP] = await as(U.a, `insert into companies (name) values ('Invite Co') returning id`);
await as(U.a, `insert into company_members (company_id,user_id) values ($1,$2)`, [coP.id,U.b]);
const [pjP] = await as(U.a, `insert into projects (company_id,name) values ($1,'Invite Film') returning id`, [coP.id]);
const [ip] = await as(U.a, `select add_project_person($1,' Zed@New.com ','Zed Zee','4045550142') r`, [pjP.id]);
const zid = ip.r.user_id;
await expect('admin adds someone without an account to a project', () => Promise.resolve([ip]), r => r[0].r.result === 'invited' && !!zid);
await expect('waiting profile made', () => as(U.a, `select full_name, email, phone, has_account from profiles where id=$1`, [zid]), r => r[0]?.full_name === 'Zed Zee' && r[0]?.email === 'zed@new.com' && r[0]?.phone === '404-555-0142' && r[0]?.has_account === false);
await expect('they are in the company and project', () => as(U.a, `select (select count(*) from company_members where user_id=$1 and company_id=$2) c, (select count(*) from project_members where user_id=$1 and project_id=$3) p`, [zid, coP.id, pjP.id]), r => Number(r[0].c) === 1 && Number(r[0].p) === 1);
await expect('non-admin cannot add people to a project', () => as(U.b, `select add_project_person($1,'y@new.com','Y')`, [pjP.id]), isErr);
await expect('bad email refused when adding', () => as(U.a, `select add_project_person($1,'zed@new','Zed')`, [pjP.id]), isErr);
await expect('adding the same email again finds the same person', () => as(U.a, `select add_company_person($1,'zed@new.com') r`, [coP.id]), r => r[0].r.user_id === zid && r[0].r.result === 'already_member');
const [rl] = await as(U.a, `select id from roles where company_id is null order by name limit 1`);
await as(U.a, `insert into company_member_roles (company_id,user_id,role_id) values ($1,$2,$3)`, [coP.id, zid, rl.id]);
const [zt] = await as(U.a, `insert into tasks (project_id,title,assignee_id) values ($1,'Scout barn',$2) returning id`, [pjP.id, zid]);
await expect('admin fixes a waiting person email', () => as(U.a, `update profiles set email='Zed@New.org' where id=$1 returning email`, [zid]), r => r[0]?.email === 'zed@new.org');
await as(U.a, `update profiles set email='zed@new.com' where id=$1`, [zid]);
await expect('cannot mark yourself as having an account', () => as(U.a, `update profiles set has_account=false where id=$1`, [U.a]), isErr);
const Z = '00000000-0000-0000-0000-0000000000e1';
await db.query(`insert into auth.users (id,email,raw_user_meta_data,email_confirmed_at) values ($1,'zed@new.com',$2,null)`, [Z, {full_name:'Zed Z', phone:''}]);
await expect('unconfirmed sign-up does not claim yet', () => as(U.a, `select has_account from profiles where id=$1`, [zid]), r => r[0]?.has_account === false);
await db.query(`update auth.users set email_confirmed_at=now() where id=$1`, [Z]);
await expect('confirming claims the waiting profile', () => as(Z, `select id, full_name, phone, has_account from profiles where id=$1`, [Z]), r => r[0]?.has_account === true && r[0]?.full_name === 'Zed Z' && r[0]?.phone === '404-555-0142');
await expect('old waiting profile is gone', () => as(U.a, `select * from profiles where id=$1`, [zid]), len(0));
await expect('claimed person sees the company and project', () => as(Z, `select (select count(*) from companies where id=$1) c, (select count(*) from projects where id=$2) p`, [coP.id, pjP.id]), r => Number(r[0].c) === 1 && Number(r[0].p) === 1);
await expect('their task and roles moved with them', () => as(Z, `select (select assignee_id from tasks where id=$1) a, (select count(*) from company_member_roles where user_id=$2) r, (select count(*) from project_member_roles where user_id=$2) pr`, [zt.id, Z]), r => r[0].a === Z && Number(r[0].r) === 1 && Number(r[0].pr) === 0);
const [ip2] = await as(U.a, `select add_company_person($1,'gone@new.com','Gone') r`, [coP.id]);
await as(U.a, `delete from company_members where company_id=$1 and user_id=$2`, [coP.id, ip2.r.user_id]);
await expect('removing a waiting person from their last company deletes them', () => db.query(`select * from profiles where id=$1`, [ip2.r.user_id]).then(r => r.rows), len(0));
const Y = '00000000-0000-0000-0000-0000000000e2';
await as(U.a, `select add_company_person($1,'yan@new.com','Yan') r`, [coP.id]);
await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'yan@new.com',$2)`, [Y, {full_name:'Yan Y'}]);
await expect('already-confirmed sign-up claims at once', () => as(Y, `select count(*) n from company_members where user_id=$1 and company_id=$2`, [Y, coP.id]), r => Number(r[0].n) === 1);
await db.query(`delete from auth.users where id=$1`, [Y]);
await expect('deleting an account deletes its profile', () => db.query(`select * from profiles where id=$1`, [Y]).then(r => r.rows), len(0));
// start dates
const [st] = await as(U.a, `insert into tasks (project_id,title,start_date,start_part,due_date) values ($1,'Build set','2026-12-01','morning','2026-12-04') returning *`, [pjP.id]);
await expect('task with a start and due date', () => Promise.resolve([st]), r => r[0].start_date && r[0].start_part === 'morning');
await expect('due before start refused', () => as(U.a, `update tasks set due_date='2026-11-30' where id=$1`, [st.id]), e => isErr(e) && /before the start/.test(e.message));
await expect('start part and time together refused', () => as(U.a, `update tasks set start_time='09:00' where id=$1`, [st.id]), isErr);
await expect('clearing the start clears its time', () => as(U.a, `update tasks set start_date=null where id=$1 returning start_part`, [st.id]), r => r[0]?.start_part === null);
await expect('start on the due day is fine', () => as(U.a, `update tasks set start_date='2026-12-04', start_time='08:00' where id=$1 returning start_time`, [st.id]), r => r[0]?.start_time?.startsWith('08:00'));
// scenes and shots
const [sc] = await as(U.b, `insert into scenes (project_id,number,set_name,int_ext,time_of_day,pages_eighths,characters,location_id) values ($1,' 12A ',' INT. DINER ','int','night',11,'Maya, Leo',$2) returning *`, [lp.id, locF.id]);
await expect('member adds a scene, tidied, at the end', () => Promise.resolve([sc]), r => r[0].number === '12A' && r[0].set_name === 'INT. DINER' && r[0].status === 'not_scheduled' && r[0].sort_order === 1 && r[0].created_by === U.b);
const [sc2] = await as(U.b, `insert into scenes (project_id,number) values ($1,'14') returning *`, [lp.id]);
await expect('next scene goes after it', () => Promise.resolve([sc2]), r => r[0].sort_order === 2);
await expect('duplicate scene number refused', () => as(U.b, `insert into scenes (project_id,number) values ($1,'12a')`, [lp.id]), isErr);
await expect('blank scene number refused', () => as(U.b, `insert into scenes (project_id,number) values ($1,'  ')`, [lp.id]), isErr);
await expect('bad time of day refused', () => as(U.b, `update scenes set time_of_day='noon' where id=$1`, [sc.id]), isErr);
await expect('negative pages refused', () => as(U.b, `update scenes set pages_eighths=-1 where id=$1`, [sc.id]), isErr);
const [farLoc] = await as(U.a, `insert into project_locations (project_id,name) values ($1,'Far Away') returning id`, [pjP.id]);
await expect('scene location from another project refused', () => as(U.b, `update scenes set location_id=$1 where id=$2`, [farLoc.id, sc.id]), isErr);
await expect('off-project member cannot see scenes', () => as(U.d, `select * from scenes where project_id=$1`, [lp.id]), len(0));
await expect('outsider cannot add a scene', () => as(U.c, `insert into scenes (project_id,number) values ($1,'99')`, [lp.id]), isErr);
await expect('scene cannot move project', () => as(U.a, `update scenes set project_id=$1 where id=$2 returning project_id`, [pjP.id, sc.id]), r => r[0]?.project_id === lp.id);
const [sh1] = await as(U.b, `insert into shots (scene_id,description,size,lens,est_minutes) values ($1,' Wide of diner ','Wide','24mm',30) returning *`, [sc.id]);
await expect('shot takes its scene project, first in order', () => Promise.resolve([sh1]), r => r[0].project_id === lp.id && r[0].sort_order === 1 && r[0].description === 'Wide of diner' && r[0].done === false);
const [sh2] = await as(U.b, `insert into shots (scene_id,description) values ($1,'Insert on envelope') returning *`, [sc.id]);
await expect('second shot is second', () => Promise.resolve([sh2]), r => r[0].sort_order === 2);
await expect('blank shot refused', () => as(U.b, `insert into shots (scene_id,description) values ($1,' ')`, [sc.id]), isErr);
await expect('outsider cannot add a shot', () => as(U.c, `insert into shots (scene_id,description) values ($1,'Sneaky')`, [sc.id]), isErr);
await expect('off-project member cannot see shots', () => as(U.d, `select * from shots where scene_id=$1`, [sc.id]), len(0));
await expect('shot cannot move scene', () => as(U.b, `update shots set scene_id=$1 where id=$2 returning scene_id`, [sc2.id, sh1.id]), r => r[0]?.scene_id === sc.id);
await expect('mark a shot done and reorder', () => as(U.b, `update shots set done=true, sort_order=3 where id=$1 returning done, sort_order`, [sh1.id]), r => r[0]?.done === true && r[0]?.sort_order === 3);
await expect('shot note records its writer', () => as(U.a, `update shots set notes='Use the slider' where id=$1 returning note_by`, [sh1.id]), r => r[0]?.note_by === U.a);
await expect('too long a shot refused', () => as(U.b, `update shots set est_minutes=2000 where id=$1`, [sh1.id]), isErr);
const [sc3] = await as(U.a, `insert into scenes (project_id,number) values ($1,'20') returning id`, [lp.id]);
await expect('only the creator or an admin deletes a scene', () => as(U.b, `delete from scenes where id=$1 returning id`, [sc3.id]), len(0));
await expect('anyone on the project deletes a shot', () => as(U.b, `delete from shots where id=$1 returning id`, [sh2.id]), len(1));
await expect('deleting a location clears it from scenes', async () => { await as(U.a, `delete from project_locations where id=$1`, [locF.id]); return as(U.b, `select location_id from scenes where id=$1`, [sc.id]); }, r => r[0]?.location_id === null);
// scene notes
const [sn] = await as(U.b, `insert into scene_notes (scene_id,body) values ($1,'  Check the diner sign  ') returning *`, [sc.id]);
await expect('member adds a scene note, trimmed and signed', () => Promise.resolve([sn]), r => r[0].body === 'Check the diner sign' && r[0].author_id === U.b);
await expect('many notes per scene', () => as(U.a, `insert into scene_notes (scene_id,body) values ($1,'Admin note') returning id`, [sc.id]), len(1));
await expect('blank scene note refused', () => as(U.b, `insert into scene_notes (scene_id,body) values ($1,'  ')`, [sc.id]), isErr);
await expect('cannot post a scene note as someone else', () => as(U.b, `insert into scene_notes (scene_id,body,author_id) values ($1,'x',$2)`, [sc.id, U.a]), isErr);
await expect('off-project member cannot read scene notes', () => as(U.d, `select * from scene_notes`), len(0));
await expect('outsider cannot add a scene note', () => as(U.c, `insert into scene_notes (scene_id,body) values ($1,'x')`, [sc.id]), isErr);
await expect('only the author edits a scene note', () => as(U.a, `update scene_notes set body='hack' where id=$1 returning id`, [sn.id]), len(0));
await expect('author edits own scene note', () => as(U.b, `update scene_notes set body='Sign is fixed' where id=$1 returning body`, [sn.id]), r => r[0]?.body === 'Sign is fixed');
await expect('scene note cannot move scene', () => as(U.b, `update scene_notes set scene_id=$1 where id=$2 returning scene_id`, [sc2.id, sn.id]), r => r[0]?.scene_id === sc.id);
const [an] = await as(U.a, `select id from scene_notes where body='Admin note'`);
await expect('member cannot delete someone else\'s scene note', () => as(U.b, `delete from scene_notes where id=$1 returning id`, [an.id]), len(0));
await expect('admin can delete a scene note', () => as(U.a, `delete from scene_notes where id=$1 returning id`, [sn.id]), len(1));
await expect('deleting a scene deletes its shots', async () => { await as(U.b, `delete from scenes where id=$1`, [sc.id]); return as(U.a, `select * from shots where scene_id=$1`, [sc.id]); }, len(0));
await expect('deleting a scene deletes its notes', () => as(U.a, `select * from scene_notes where scene_id=$1`, [sc.id]), len(0));
// characters
const [chp] = await as(U.a, `insert into projects (company_id,name) values ($1,'Character Film') returning id`, [cc.id]);
await as(U.a, `insert into project_members (project_id,user_id) values ($1,$2),($1,$3)`, [chp.id, U.b, U.d]);
const [ch1] = await as(U.b, `insert into characters (project_id,name,cast_number,kind,age_range) values ($1,'  Ellie ',1,'lead',' 30s ') returning *`, [chp.id]);
await expect('member adds a character, tidied, open for casting', () => Promise.resolve([ch1]), r => r[0].name === 'Ellie' && r[0].age_range === '30s' && r[0].casting_status === 'open' && r[0].created_by === U.b);
await expect('duplicate character name refused', () => as(U.b, `insert into characters (project_id,name) values ($1,'ellie')`, [chp.id]), isErr);
await expect('duplicate cast number refused', () => as(U.b, `insert into characters (project_id,name,cast_number) values ($1,'Mark',1)`, [chp.id]), isErr);
await expect('comma in a name refused', () => as(U.b, `insert into characters (project_id,name) values ($1,'Mark, Jr')`, [chp.id]), isErr);
await expect('outsider cannot add a character', () => as(U.c, `insert into characters (project_id,name) values ($1,'Nope')`, [chp.id]), isErr);
await expect('off-project person cannot see characters', () => as(U.d, `select * from characters where project_id=$1`, [lp.id]), len(0));
await expect('actor must be on the team', () => as(U.b, `update characters set actor_id=$1 where id=$2`, [U.c, ch1.id]), isErr);
await expect('picking an actor marks the character cast', () => as(U.b, `update characters set actor_id=$1 where id=$2 returning casting_status`, [U.d, ch1.id]), r => r[0]?.casting_status === 'cast');
await expect('status can still be set by hand', () => as(U.b, `update characters set casting_status='offered' where id=$1 returning casting_status`, [ch1.id]), r => r[0]?.casting_status === 'offered');
await expect('character cannot move project', () => as(U.b, `update characters set project_id=$1 where id=$2 returning project_id`, [lp.id, ch1.id]), r => r[0]?.project_id === chp.id);
// scene links, from the scene's Characters text and from links
const [chs] = await as(U.b, `insert into scenes (project_id,number,characters) values ($1,'1','Mark, ellie , Ranger Dale') returning id`, [chp.id]);
await expect('names in a scene link characters, adding new ones', () => as(U.b, `select c.name from scene_characters l join characters c on c.id=l.character_id where l.scene_id=$1 order by c.name`, [chs.id]),
  r => r.map((x) => x.name).join('|') === 'Ellie|Mark|Ranger Dale');
await expect('the scene shows the names by cast number, then name', () => as(U.b, `select characters from scenes where id=$1`, [chs.id]), r => r[0]?.characters === 'Ellie, Mark, Ranger Dale');
const [mark] = await as(U.b, `select id from characters where project_id=$1 and name='Mark'`, [chp.id]);
await expect('new characters are added by whoever typed them', () => as(U.b, `select created_by from characters where id=$1`, [mark.id]), r => r[0]?.created_by === U.b);
await expect('a look note on a link', () => as(U.b, `update scene_characters set look_note=' Muddy jacket ' where scene_id=$1 and character_id=$2 returning look_note`, [chs.id, ch1.id]), r => r[0]?.look_note === 'Muddy jacket');
await as(U.b, `update scenes set characters='Ellie' where id=$1`, [chs.id]);
await expect('removing names removes links, keeps the rest and their notes', () => as(U.b, `select look_note from scene_characters where scene_id=$1`, [chs.id]), r => r.length === 1 && r[0].look_note === 'Muddy jacket');
await expect('removed names stay as characters', () => as(U.b, `select count(*)::int n from characters where project_id=$1`, [chp.id]), r => r[0].n === 3);
await as(U.b, `insert into scene_characters (scene_id,character_id) values ($1,$2)`, [chs.id, mark.id]);
await expect('a link added from the character updates the scene', () => as(U.b, `select characters from scenes where id=$1`, [chs.id]), r => r[0]?.characters === 'Ellie, Mark');
await as(U.b, `update characters set name='Marcus', cast_number=2 where id=$1`, [mark.id]);
await expect('renaming a character renames it in its scenes', () => as(U.b, `select characters from scenes where id=$1`, [chs.id]), r => r[0]?.characters === 'Ellie, Marcus');
const [otherCh] = await as(U.b, `insert into characters (project_id,name) values ($1,'Waitress') returning id`, [lp.id]);
await expect('character from another project refused', () => as(U.b, `insert into scene_characters (scene_id,character_id) values ($1,$2)`, [chs.id, otherCh.id]), isErr);
await expect('outsider cannot link', () => as(U.c, `insert into scene_characters (scene_id,character_id) values ($1,$2)`, [chs.id, otherCh.id]), isErr);
// notes
const [chn] = await as(U.b, `insert into character_notes (character_id,body) values ($1,' Has a scar on her left hand ') returning *`, [ch1.id]);
await expect('character note tidied', () => Promise.resolve([chn]), r => r[0].body === 'Has a scar on her left hand' && r[0].author_id === U.b);
await expect('only the author edits a character note', () => as(U.d, `update character_notes set body='x' where id=$1 returning id`, [chn.id]), len(0));
await expect('outsider cannot read character notes', () => as(U.c, `select * from character_notes`), len(0));
await expect('member cannot delete someone else\'s character', () => as(U.d, `delete from characters where id=$1 returning id`, [ch1.id]), len(0));
await expect('character changes are logged', () => as(U.a, `select table_name from audit_log where project_id=$1 and table_name in ('characters','scene_characters','character_notes')`, [chp.id]),
  r => ['characters', 'scene_characters', 'character_notes'].every((t) => r.some((x) => x.table_name === t)));
await as(U.a, `delete from project_members where project_id=$1 and user_id=$2`, [chp.id, U.d]);
await expect('taking the actor off the team clears them', () => as(U.b, `select actor_id, casting_status from characters where id=$1`, [ch1.id]), r => r[0]?.actor_id === null && r[0]?.casting_status === 'offered');
await as(U.a, `delete from characters where id=$1`, [ch1.id]);
await expect('deleting a character removes it from its scenes', () => as(U.b, `select characters from scenes where id=$1`, [chs.id]), r => r[0]?.characters === 'Marcus');
await expect('and its notes are logged against it', () => as(U.a, `select project_id from audit_log where table_name='character_notes' and action='delete'`), r => r.length === 1 && r[0].project_id === chp.id);
// dietary needs and team member notes
const [tnp] = await as(U.a, `insert into projects (company_id,name) values ($1,'Notes Film') returning id`, [cc.id]);
await as(U.a, `insert into project_members (project_id,user_id) values ($1,$2),($1,$3)`, [tnp.id, U.b, U.d]);
await expect('the person sets their own dietary needs', () => as(U.b, `select set_dietary($1,$2,'  Vegetarian ',false)`, [tnp.id, U.b]), ok);
await expect('stored tidied', () => as(U.d, `select dietary, dietary_allergy from project_members where project_id=$1 and user_id=$2`, [tnp.id, U.b]), r => r[0]?.dietary === 'Vegetarian' && r[0]?.dietary_allergy === false);
await expect('someone else on the team cannot set them', () => as(U.d, `select set_dietary($1,$2,'Vegan',false)`, [tnp.id, U.b]), isErr);
await expect('an admin can set anyone\'s', () => as(U.a, `select set_dietary($1,$2,'Peanut allergy',true)`, [tnp.id, U.d]), ok);
await expect('blank needs clear the allergy flag', async () => { await as(U.a, `select set_dietary($1,$2,'  ',true)`, [tnp.id, U.b]); return as(U.b, `select dietary, dietary_allergy from project_members where project_id=$1 and user_id=$2`, [tnp.id, U.b]); }, r => r[0]?.dietary === null && r[0]?.dietary_allergy === false);
await expect('outsiders cannot set dietary needs', () => as(U.c, `select set_dietary($1,$2,'x',false)`, [tnp.id, U.c]), isErr);
await expect('direct edits by members are refused', () => as(U.b, `update project_members set dietary='x' where project_id=$1 and user_id=$2 returning user_id`, [tnp.id, U.b]), len(0));
const types = await as(U.b, `select id, name from team_note_types where company_id=$1 order by sort_order`, [cc.id]);
await expect('each company starts with note types', () => Promise.resolve(types), r => r.length === 7 && r[0].name === 'General');
await expect('members cannot add note types', () => as(U.b, `insert into team_note_types (company_id,name) values ($1,'Pets')`, [cc.id]), isErr);
await expect('admins add note types', () => as(U.a, `insert into team_note_types (company_id,name) values ($1,' Pets ') returning name`, [cc.id]), r => r[0]?.name === 'Pets');
const travel = types.find((t) => t.name === 'Travel');
const [tn1] = await as(U.a, `insert into team_notes (project_id,user_id,type_id,body) values ($1,$2,$3,' Flies in Dec 6 ') returning *`, [tnp.id, U.d, travel.id]);
await expect('admin adds a note about someone', () => Promise.resolve([tn1]), r => r[0].body === 'Flies in Dec 6' && r[0].author_id === U.a);
await expect('the person sees notes about them', () => as(U.d, `select * from team_notes`), len(1));
await expect('others on the team do not', () => as(U.b, `select * from team_notes`), len(0));
await expect('members cannot add notes about others', () => as(U.b, `insert into team_notes (project_id,user_id,body) values ($1,$2,'x')`, [tnp.id, U.d]), isErr);
await expect('a person adds a note about themselves', () => as(U.b, `insert into team_notes (project_id,user_id,body) values ($1,$2,'Out on Dec 8 afternoon') returning id`, [tnp.id, U.b]), len(1));
await expect('the person cannot edit the admin\'s note', () => as(U.d, `update team_notes set body='x' where id=$1 returning id`, [tn1.id]), len(0));
await expect('or delete it', () => as(U.d, `delete from team_notes where id=$1 returning id`, [tn1.id]), len(0));
const [otherCo] = await as(U.c, `insert into companies (name) values ('Other Co') returning id`);
const [otherType] = await as(U.c, `select id from team_note_types where company_id=$1 limit 1`, [otherCo.id]);
await expect('a note type from another company is refused', () => as(U.a, `update team_notes set type_id=$1 where id=$2`, [otherType.id, tn1.id]), isErr);
await expect('team notes are logged', () => as(U.a, `select subject_user_id from audit_log where table_name='team_notes' and action='insert' and project_id=$1`, [tnp.id]), r => r.length === 2);
await as(U.a, `delete from team_note_types where id=$1`, [travel.id]);
await expect('deleting a type keeps its notes', () => as(U.a, `select type_id from team_notes where id=$1`, [tn1.id]), r => r.length === 1 && r[0].type_id === null);
await as(U.a, `delete from project_members where project_id=$1 and user_id=$2`, [tnp.id, U.d]);
await expect('taking someone off the project removes notes about them', () => as(U.a, `select * from team_notes where user_id=$1`, [U.d]), len(0));
// shoot days and call sheets
// Crew on a project: a role outside the Cast department (people with no roles count as cast).
const crewRole = (await db.query(`select id from roles where company_id is null and name='Gaffer'`)).rows[0].id;
const castRole = (await db.query(`select id from roles where company_id is null and name='Actor'`)).rows[0].id;
const makeCrew = (pid, uid) => db.query(`insert into project_member_roles values ($1,$2,$3) on conflict do nothing`, [pid, uid, crewRole]);
await makeCrew(lp.id, U.b);
const [sdLoc] = await as(U.b, `insert into project_locations (project_id,name,parking,nearest_hospital) values ($1,'Diner',' Lot behind ','  St. Mary ER ') returning *`, [lp.id]);
await expect('location parking and hospital tidied', () => Promise.resolve([sdLoc]), r => r[0].parking === 'Lot behind' && r[0].nearest_hospital === 'St. Mary ER');
const [scA] = await as(U.b, `insert into scenes (project_id,number) values ($1,'30') returning id`, [lp.id]);
const [day] = await as(U.b, `insert into shoot_days (project_id,shoot_date,crew_call,version) values ($1,'2027-03-12','16:00',5) returning id, version, created_by`, [lp.id]);
const [sdLoc2] = await as(U.b, `insert into project_locations (project_id,name,nearest_hospital) values ($1,'Park','County General') returning *`, [lp.id]);
await expect('a day gets its locations, in order', async () => {
  await as(U.b, `insert into shoot_day_locations (shoot_day_id,location_id) values ($1,$2)`, [day.id, sdLoc.id]);
  await as(U.b, `insert into shoot_day_locations (shoot_day_id,location_id) values ($1,$2)`, [day.id, sdLoc2.id]);
  return as(U.b, `select location_id, project_id, sort_order from shoot_day_locations where shoot_day_id=$1 order by sort_order`, [day.id]);
}, r => r.length === 2 && r[0].location_id === sdLoc.id && r[1].location_id === sdLoc2.id && r[0].project_id === lp.id && r[0].sort_order < r[1].sort_order);
await expect('same location twice on a day refused', () => as(U.b, `insert into shoot_day_locations (shoot_day_id,location_id) values ($1,$2)`, [day.id, sdLoc.id]), isErr);
await expect('member adds a shoot day, unsent', () => Promise.resolve([day]), r => r[0].version === 0 && r[0].created_by === U.b);
await expect('version cannot be set by hand', () => as(U.b, `update shoot_days set version=9 where id=$1 returning version`, [day.id]), r => r[0]?.version === 0);
await expect('day location from another project refused', () => as(U.b, `insert into shoot_day_locations (shoot_day_id,location_id) values ($1,$2)`, [day.id, farLoc.id]), isErr);
await expect('outsider cannot add a day location', () => as(U.c, `insert into shoot_day_locations (shoot_day_id,location_id) values ($1,$2)`, [day.id, sdLoc2.id]), isErr);
await expect('off-project member cannot see day locations', () => as(U.d, `select * from shoot_day_locations where shoot_day_id=$1`, [day.id]), len(0));
await expect('off-project member cannot see days', () => as(U.d, `select id from shoot_days where project_id=$1`, [lp.id]), len(0));
await expect('outsider cannot add a day', () => as(U.c, `insert into shoot_days (project_id,shoot_date) values ($1,'2027-03-13')`, [lp.id]), isErr);
await expect('scene goes on the day', () => as(U.b, `insert into shoot_day_items (shoot_day_id,kind,scene_id) values ($1,'scene',$2) returning project_id, sort_order`, [day.id, scA.id]), r => r[0]?.project_id === lp.id && r[0]?.sort_order === 1);
await expect('scene on a day is scheduled', () => as(U.b, `select status from scenes where id=$1`, [scA.id]), r => r[0]?.status === 'scheduled');
await expect('same scene twice refused', () => as(U.b, `insert into shoot_day_items (shoot_day_id,kind,scene_id) values ($1,'scene',$2)`, [day.id, scA.id]), isErr);
await expect('meal break with a time', () => as(U.b, `insert into shoot_day_items (shoot_day_id,kind,at_time) values ($1,'meal','22:00') returning sort_order`, [day.id]), r => r[0]?.sort_order === 2);
await expect('company move needs words', () => as(U.b, `insert into shoot_day_items (shoot_day_id,kind) values ($1,'move')`, [day.id]), isErr);
await expect('scene item needs a scene', () => as(U.b, `insert into shoot_day_items (shoot_day_id,kind) values ($1,'scene')`, [day.id]), isErr);
const [scFar] = await as(U.a, `insert into scenes (project_id,number) values ($1,'1') returning id`, [pjP.id]);
await expect('scene from another project refused', () => as(U.b, `insert into shoot_day_items (shoot_day_id,kind,scene_id) values ($1,'scene',$2)`, [day.id, scFar.id]), isErr);
await expect('call someone on the project', () => as(U.b, `insert into shoot_day_calls (shoot_day_id,user_id,call_time,character_name,confirmed_version) values ($1,$2,'15:30',' Maya ',7) returning *`, [day.id, U.b]), r => r[0]?.character_name === 'Maya' && r[0]?.confirmed_version === 0);
await expect('cannot call someone off the project', () => as(U.b, `insert into shoot_day_calls (shoot_day_id,user_id) values ($1,$2)`, [day.id, U.d]), isErr);
await expect('cannot confirm before it is sent', () => as(U.b, `select mark_call_sheet($1,true)`, [day.id]), isErr);
await expect('send the call sheet', () => as(U.b, `select publish_call_sheet($1) v`, [day.id]), r => r[0]?.v === 1);
await expect('sent stamp', () => as(U.b, `select version, sent_by from shoot_days where id=$1`, [day.id]), r => r[0]?.version === 1 && r[0]?.sent_by === U.b);
await expect('outsider cannot send', () => as(U.c, `select publish_call_sheet($1)`, [day.id]), isErr);
await expect('confirm cannot be faked by update', () => as(U.b, `update shoot_day_calls set confirmed_version=1 where shoot_day_id=$1 returning confirmed_version`, [day.id]), r => r[0]?.confirmed_version === 0);
await expect('person confirms', async () => { await as(U.b, `select mark_call_sheet($1,true)`, [day.id]); return as(U.b, `select viewed_version, confirmed_version from shoot_day_calls where shoot_day_id=$1`, [day.id]); }, r => r[0]?.viewed_version === 1 && r[0]?.confirmed_version === 1);
await expect('admin not called cannot confirm', () => as(U.a, `select mark_call_sheet($1,true)`, [day.id]), isErr);
await expect('new version needs a new confirm', async () => { await as(U.b, `select publish_call_sheet($1)`, [day.id]); return as(U.b, `select d.version, c.confirmed_version from shoot_days d join shoot_day_calls c on c.shoot_day_id=d.id where d.id=$1`, [day.id]); }, r => r[0]?.version === 2 && r[0]?.confirmed_version === 1);
await expect('editing a day keeps its version', () => as(U.b, `update shoot_days set notes='Rain' where id=$1 returning version`, [day.id]), r => r[0]?.version === 2);
// who wrote each note kept in a field
await expect('day note records its writer', () => as(U.b, `select note_by, note_at from shoot_days where id=$1`, [day.id]), r => r[0]?.note_by === U.b && r[0]?.note_at);
await expect('changing the day note moves it to the new writer', () => as(U.a, `update shoot_days set notes='Rain after 3' where id=$1 returning note_by`, [day.id]), r => r[0]?.note_by === U.a);
await expect('other day edits keep the note writer', () => as(U.b, `update shoot_days set title='Diner' where id=$1 returning note_by`, [day.id]), r => r[0]?.note_by === U.a);
await expect('note writer cannot be faked', () => as(U.b, `update shoot_days set note_by=$2 where id=$1 returning note_by`, [day.id, U.b]), r => r[0]?.note_by === U.a);
await expect('clearing the day note clears its writer', () => as(U.b, `update shoot_days set notes='  ' where id=$1 returning note_by, note_at`, [day.id]), r => r[0]?.note_by === null && r[0]?.note_at === null);
await expect('schedule note records its writer', () => as(U.b, `insert into shoot_day_items (shoot_day_id,kind,label) values ($1,'note','Quiet on set') returning note_by, note_at`, [day.id]), r => r[0]?.note_by === U.b && r[0]?.note_at);
await expect('company move is not a note', () => as(U.b, `insert into shoot_day_items (shoot_day_id,kind,label) values ($1,'move','To the park') returning note_by`, [day.id]), r => r[0]?.note_by === null);
await expect('call note records its writer', () => as(U.a, `update shoot_day_calls set note='Bring boots' where shoot_day_id=$1 returning note_by`, [day.id]), r => r[0]?.note_by === U.a);
await expect('viewing keeps the call note writer', async () => { await as(U.b, `select mark_call_sheet($1,false)`, [day.id]); return as(U.b, `select note_by from shoot_day_calls where shoot_day_id=$1`, [day.id]); }, r => r[0]?.note_by === U.a);
// personal call sheet links
await db.exec(`grant usage on schema public to anon;`);
async function asAnon(sql, params=[]) {
  await db.exec(`reset role; select set_config('request.jwt.sub', '', false); set role anon;`);
  try { const r = await db.query(sql, params); return r.rows; } finally { await db.exec('reset role'); }
}
const [bCall] = await as(U.b, `select link_token from shoot_day_calls where shoot_day_id=$1 and user_id=$2`, [day.id, U.b]);
await expect('each call gets a link token', () => Promise.resolve(bCall), r => /^[0-9a-f-]{36}$/.test(r?.link_token));
await expect('link token cannot be changed', () => as(U.b, `update shoot_day_calls set link_token=gen_random_uuid() where shoot_day_id=$1 returning link_token`, [day.id]), r => r[0]?.link_token === bCall.link_token);
await expect('anon cannot read calls directly', () => asAnon(`select * from shoot_day_calls`), isErr);
const [sheetRow] = await asAnon(`select call_sheet_for_link($1) s`, [bCall.link_token]);
await expect('link opens the sheet without signing in', () => Promise.resolve(sheetRow.s), s => s?.me === U.b && s.day.version === 2 && s.calls.length === 1 && s.project.name && Array.isArray(s.items) && s.scenes.length === 1);
await expect('link sheet lists every location in order', () => Promise.resolve(sheetRow.s), s => s.locations?.length === 2 && s.locations[0].name === 'Diner' && s.locations[0].nearest_hospital === 'St. Mary ER' && s.locations[1].name === 'Park' && !('location' in s));
await expect('a scene with no location has none on the sheet', () => Promise.resolve(sheetRow.s), s => s.scenes[0].location_name === null && s.scenes[0].location_id === null);
await expect('link sheet has no emails', () => Promise.resolve(JSON.stringify(sheetRow.s)), s => !s.includes('@x.com'));
await expect('opening the link counts as viewed', () => as(U.b, `select viewed_version from shoot_day_calls where shoot_day_id=$1`, [day.id]), r => r[0]?.viewed_version === 2);
await expect('sheet says not confirmed yet', () => Promise.resolve(sheetRow.s), s => s.confirmed === false);
await expect('confirm from the link without signing in', async () => { await asAnon(`select confirm_call_sheet_link($1)`, [bCall.link_token]); return as(U.b, `select confirmed_version from shoot_day_calls where shoot_day_id=$1`, [day.id]); }, r => r[0]?.confirmed_version === 2);
await expect('sheet then shows confirmed', () => asAnon(`select call_sheet_for_link($1) s`, [bCall.link_token]), r => r[0]?.s?.confirmed === true);
await as(U.b, `select set_dietary($1,$2,'Shellfish allergy',true)`, [lp.id, U.b]);
await as(U.b, `update characters set cast_number=1, actor_id=$2 where project_id=$1 and name='Maya'`, [lp.id, U.b]);
await expect('a personal link shows the reader\'s characters and own dietary needs', () => asAnon(`select call_sheet_for_link($1) s`, [bCall.link_token]),
  r => { const me = r[0]?.s?.calls?.find((c) => c.user_id === U.b); return me?.characters?.[0]?.name === 'Maya' && me.characters[0].cast_number === 1 && me.dietary?.needs === 'Shellfish allergy' && me.dietary.allergy === true; });
await expect('unknown link cannot confirm', () => asAnon(`select confirm_call_sheet_link(gen_random_uuid())`), isErr);
await expect('unknown link shows nothing', () => asAnon(`select call_sheet_for_link(gen_random_uuid()) s`), r => r[0]?.s === null);
const [sdLoc3] = await as(U.b, `insert into project_locations (project_id,name) values ($1,'Warehouse') returning id`, [lp.id]);
const [scB] = await as(U.b, `insert into scenes (project_id,number,location_id) values ($1,'31',$2) returning id`, [lp.id, sdLoc3.id]);
await expect('a scene location missing from the day is added at the end', async () => {
  await as(U.b, `insert into shoot_day_items (shoot_day_id,kind,scene_id) values ($1,'scene',$2)`, [day.id, scB.id]);
  return as(U.b, `select location_id from shoot_day_locations where shoot_day_id=$1 order by sort_order`, [day.id]);
}, r => r.length === 3 && r[0].location_id === sdLoc.id && r[1].location_id === sdLoc2.id && r[2].location_id === sdLoc3.id);
await expect('a scene location already on the day is not added twice', async () => {
  await as(U.b, `update scenes set location_id=$2 where id=$1`, [scB.id, sdLoc.id]);
  return as(U.b, `select location_id from shoot_day_locations where shoot_day_id=$1 and location_id=$2`, [day.id, sdLoc.id]);
}, len(1));
const [sdLoc4] = await as(U.b, `insert into project_locations (project_id,name) values ($1,'Beach') returning id`, [lp.id]);
await as(U.a, `insert into company_members (company_id,user_id) values ($1,$2)`, [cc.id, U.c]);
await as(U.a, `insert into project_members (project_id,user_id) values ($1,$2)`, [lp.id, U.c]);
await expect('cast changing a scene location still adds it to the day', async () => {
  await as(U.c, `update scenes set location_id=$2 where id=$1`, [scA.id, sdLoc4.id]);
  return as(U.b, `select location_id from shoot_day_locations where shoot_day_id=$1 order by sort_order`, [day.id]);
}, r => r.at(-1).location_id === sdLoc4.id && r.filter((x) => x.location_id === sdLoc4.id).length === 1);
await as(U.a, `delete from project_members where project_id=$1 and user_id=$2`, [lp.id, U.c]);
await as(U.a, `delete from company_members where company_id=$1 and user_id=$2`, [cc.id, U.c]);
const [aheadLoc] = await as(U.b, `insert into project_locations (project_id,name) values ($1,'Harbor') returning id`, [lp.id]);
const [scNext] = await as(U.b, `insert into scenes (project_id,number,set_name,location_id) values ($1,'40','Dock',$2) returning id`, [lp.id, aheadLoc.id]);
const [ahead] = await as(U.b, `insert into shoot_days (project_id,shoot_date) values ($1,'2027-03-20') returning id`, [lp.id]);
await expect('the following day gains the scene location', async () => {
  await as(U.b, `insert into shoot_day_items (shoot_day_id,kind,scene_id) values ($1,'scene',$2)`, [ahead.id, scNext.id]);
  return as(U.b, `select location_id from shoot_day_locations where shoot_day_id=$1`, [ahead.id]);
}, r => r.length === 1 && r[0].location_id === aheadLoc.id);
await expect('the advance schedule names each scene location', () => asAnon(`select call_sheet_for_link($1) s`, [bCall.link_token]), r => {
  const s = r[0]?.s;
  const today = s?.scenes?.find((x) => x.number === '30');
  return today?.location_name === 'Beach' && s.next_day?.locations?.[0]?.name === 'Harbor'
    && s.next_day.scenes[0].location_name === 'Harbor' && s.next_day.scenes[0].set_name === 'Dock';
});
const [dayShare] = await as(U.b, `select share_call_sheet($1, true) t`, [day.id]);
await expect('the shared sheet names the scene location', () => asAnon(`select call_sheet_for_share($1) s`, [dayShare.t]), r => {
  const s = r[0]?.s;
  return s?.scenes?.find((x) => x.number === '30')?.location_name === 'Beach' && s.next_day?.scenes?.[0]?.location_name === 'Harbor';
});
await as(U.b, `select share_call_sheet($1, false)`, [day.id]);
await as(U.b, `delete from shoot_day_items where scene_id=$1`, [scB.id]);
await as(U.b, `delete from shoot_days where id=$1`, [ahead.id]);
const [day2] = await as(U.a, `insert into shoot_days (project_id,shoot_date) values ($1,'2027-03-13') returning id`, [lp.id]);
await expect('only the creator or an admin deletes a day', () => as(U.b, `delete from shoot_days where id=$1 returning id`, [day2.id]), len(0));
await expect('leaving the project removes their calls', async () => { await as(U.a, `delete from project_members where project_id=$1 and user_id=$2`, [lp.id, U.b]); return as(U.a, `select * from shoot_day_calls where shoot_day_id=$1`, [day.id]); }, len(0));
await expect('deleting a scene removes it from days', async () => { await as(U.a, `delete from scenes where id=$1`, [scA.id]); return as(U.a, `select * from shoot_day_items where shoot_day_id=$1 and kind='scene'`, [day.id]); }, len(0));
// ---- audit trail ----
const [ac] = await as(U.a, `insert into companies (name) values ('Audit Co') returning id`);
await as(U.a, `insert into company_members (company_id,user_id) values ($1,$2),($1,$3)`, [ac.id, U.b, U.c]);
const [ap] = await as(U.a, `insert into projects (company_id,name) values ($1,'Audit Film') returning id`, [ac.id]);
await as(U.a, `insert into project_members (project_id,user_id) values ($1,$2),($1,$3)`, [ap.id, U.b, U.c]);
const [at1] = await as(U.b, `insert into tasks (project_id,title) values ($1,'Book crane') returning id`, [ap.id]);
await expect('adding a task is logged with who and what', () => as(U.a, `select * from audit_log where table_name='tasks' and row_key=$1`, [at1.id]),
  r => r.length === 1 && r[0].action === 'insert' && r[0].actor_id === U.b && !!r[0].actor_name && r[0].item_label === 'Book crane' && r[0].project_id === ap.id && r[0].company_id === ac.id && r[0].after?.title === 'Book crane' && r[0].before === null && r[0].source === 'app');
await as(U.b, `update tasks set title='Book big crane', status='in_progress' where id=$1`, [at1.id]);
await expect('a change keeps before, after and the changed fields', () => as(U.a, `select * from audit_log where table_name='tasks' and row_key=$1 and action='update'`, [at1.id]),
  r => r.length === 1 && r[0].before.title === 'Book crane' && r[0].after.title === 'Book big crane' && JSON.stringify(r[0].changed) === '["status","title"]');
await as(U.b, `update tasks set title=title where id=$1`, [at1.id]);
await expect('a save that changes nothing is not logged', () => as(U.a, `select * from audit_log where table_name='tasks' and row_key=$1 and action='update'`, [at1.id]), len(1));
await expect('members who are not admins cannot read the log', () => as(U.b, `select * from audit_log where company_id=$1`, [ac.id]), len(0));
await expect('admins of other companies cannot read it', () => as(U.d, `select * from audit_log where company_id=$1`, [ac.id]), len(0));
await expect('nobody can write to the log directly', () => as(U.a, `insert into audit_log (action,table_name,row_key) values ('insert','tasks','x')`), isErr);
await expect('nobody can change entries', () => as(U.a, `update audit_log set actor_name='X' where company_id=$1 returning id`, [ac.id]), r => r instanceof Error || r.length === 0);
await expect('nobody can delete entries directly', () => as(U.a, `delete from audit_log where company_id=$1 returning id`, [ac.id]), r => r instanceof Error || r.length === 0);
await as(U.c, `insert into task_notes (task_id,body) values ($1,'Call Joe') returning id`, [at1.id]);
const [atag] = await as(U.b, `insert into task_tags (company_id,name) values ($1,'Rigging') returning id`, [ac.id]);
await as(U.b, `insert into task_tag_links (task_id,tag_id) values ($1,$2)`, [at1.id, atag.id]);
await expect('notes and tags are logged under their task', () => as(U.a, `select table_name, item_label from audit_log where parent_table='tasks' and parent_key=$1 order by id`, [at1.id]),
  r => r.length === 2 && r[0].table_name === 'task_notes' && r[1].item_label === 'Rigging');
await as(U.a, `delete from tasks where id=$1`, [at1.id]);
await expect('deleting a task logs the things deleted with it, with their project', () => as(U.a, `select table_name, project_id, company_id from audit_log where action='delete' and (row_key=$1 or parent_key=$1) order by id`, [at1.id]),
  r => r.length === 3 && r[0].table_name === 'tasks' && r.every((x) => x.project_id === ap.id && x.company_id === ac.id));
await expect('a deleted task keeps its last values', () => as(U.a, `select before from audit_log where action='delete' and table_name='tasks' and row_key=$1`, [at1.id]), r => r[0]?.before?.title === 'Book big crane');
// private journal entries
const [pj] = await as(U.b, `insert into journal_entries (project_id,title,body) values ($1,'My worries','Budget is tight') returning id`, [ap.id]);
await as(U.b, `insert into journal_entry_shares (entry_id,user_id) values ($1,$2)`, [pj.id, U.c]);
await expect('a private entry shows only that it happened', () => as(U.a, `select * from audit_log where row_key=$1 or parent_key=$1 order by id`, [pj.id]),
  r => r.length === 2 && r.every((x) => x.private && x.before === null && x.after === null) && r[0].item_label === 'Private journal entry' && !JSON.stringify(r).includes('worries') && !JSON.stringify(r).includes('Budget'));
await expect('its content is kept but cannot be read', () => as(U.a, `select * from audit_private`), r => r instanceof Error || r.length === 0);
await expect('the full content is stored', () => db.query(`select p.after->>'body' b from audit_private p join audit_log l on l.id=p.audit_id where l.row_key=$1`, [pj.id]).then((r) => r.rows), r => r[0]?.b === 'Budget is tight');
const [pub] = await as(U.b, `insert into journal_entries (project_id,title,body,visibility) values ($1,'Wrap','Day 1 done','public') returning id`, [ap.id]);
await expect('a public entry is logged in full', () => as(U.a, `select after from audit_log where row_key=$1`, [pub.id]), r => r[0]?.after?.body === 'Day 1 done');
// people
await as(U.a, `update profiles set phone='9195550100' where id=$1`, [U.c]);
await expect('profile changes show to admins of the person\'s companies', () => as(U.a, `select changed from audit_log where table_name='profiles' and row_key=$1 and action='update'`, [U.c]), r => r.length >= 1 && r.at(-1).changed.includes('phone'));
await expect('but not to people who are not their admins', () => as(U.b, `select * from audit_log where table_name='profiles' and row_key=$1`, [U.c]), len(0));
// sign-ins
await db.query(`insert into auth.sessions (user_id, user_agent) values ($1, 'Test browser')`, [U.c]);
await expect('sign-ins are logged', () => as(U.a, `select * from audit_log where action='sign_in' and subject_user_id=$1`, [U.c]), r => r.length === 1 && r[0].actor_id === U.c && r[0].detail === 'Test browser');
// call sheet views
await makeCrew(ap.id, U.b);
const [aday] = await as(U.b, `insert into shoot_days (project_id,shoot_date) values ($1,'2027-04-01') returning id`, [ap.id]);
await as(U.b, `insert into shoot_day_calls (shoot_day_id,user_id) values ($1,$2)`, [aday.id, U.c]);
await as(U.b, `select publish_call_sheet($1)`, [aday.id]);
await as(U.b, `select log_call_sheet_view($1)`, [aday.id]);
await expect('opening the call sheet in the app is logged', () => as(U.a, `select * from audit_log where action='view' and row_key=$1`, [aday.id]), r => r.length === 1 && r[0].actor_id === U.b && r[0].source === 'app');
await expect('outsiders cannot log views', () => as(U.d, `select log_call_sheet_view($1)`, [aday.id]), isErr);
const [cTok] = await as(U.c, `select link_token from shoot_day_calls where shoot_day_id=$1`, [aday.id]);
await asAnon(`select call_sheet_for_link($1)`, [cTok.link_token]);
await asAnon(`select call_sheet_for_link($1)`, [cTok.link_token]);
await expect('each opening of a personal link is logged for that person', () => as(U.a, `select * from audit_log where action='view' and row_key=$1 and source='link'`, [aday.id]), r => r.length === 2 && r.every((x) => x.actor_id === U.c));
await expect('opening a link is not also logged as a change', () => as(U.a, `select * from audit_log where company_id=$1 and table_name='shoot_day_calls' and action='update' and 'viewed_at'=any(changed)`, [ac.id]), len(0));
await asAnon(`select confirm_call_sheet_link($1)`, [cTok.link_token]);
await expect('confirming from a link is logged as that person', () => as(U.a, `select * from audit_log where company_id=$1 and table_name='shoot_day_calls' and action='update' and source='link'`, [ac.id]), r => r.length === 1 && r[0].actor_id === U.c && r[0].changed.includes('confirmed_at'));
await expect('link codes are not kept in the log', () => as(U.a, `select * from audit_log where table_name='shoot_day_calls'`), r => r.length > 0 && !JSON.stringify(r).includes(cTok.link_token));
// shared call sheet link (one for the whole day)
await expect('a day has no shared link until it is turned on', () => as(U.b, `select share_token from shoot_day_share_tokens($1) where id=$2`, [ap.id, aday.id]), r => r[0]?.share_token === null);
await expect('the shared link cannot be set directly', () => as(U.b, `update shoot_days set share_token=gen_random_uuid(), share_phones=true where id=$1`, [aday.id]).then(() => as(U.b, `select t.share_token, d.share_phones from shoot_day_share_tokens($1) t join shoot_days d on d.id=t.id where t.id=$2`, [ap.id, aday.id])), r => r[0]?.share_token === null && r[0]?.share_phones === false);
await expect('outsiders cannot turn it on', () => as(U.d, `select share_call_sheet($1, true)`, [aday.id]), isErr);
const [slSh1] = await as(U.b, `select share_call_sheet($1, true) t`, [aday.id]);
await expect('anyone on the project turns it on', () => Promise.resolve(slSh1), r => /^[0-9a-f-]{36}$/.test(r?.t));
await expect('cast cannot turn on the shared link', () => as(U.c, `select share_call_sheet($1, true)`, [aday.id]), isErr);
await expect('cast cannot read the shared link code', () => as(U.c, `select share_token from shoot_days where id=$1`, [aday.id]), isErr);
await expect('nor through the crew function', () => as(U.c, `select * from shoot_day_share_tokens($1)`, [ap.id]), len(0));

await expect('turning it on again keeps the same link', () => as(U.b, `select share_call_sheet($1, true) t`, [aday.id]), r => r[0]?.t === slSh1.t);
await as(U.a, `update profiles set phone='9195550111' where id=$1`, [U.c]);
const [slShared] = await asAnon(`select call_sheet_for_share($1) s`, [slSh1.t]);
await expect('the shared link opens the whole sheet without signing in', () => Promise.resolve(slShared.s), s => s?.day?.version === 1 && s.calls.length === 1 && s.project.name === 'Audit Film' && s.me === undefined);
await expect('it never shows dietary needs', () => Promise.resolve(JSON.stringify(slShared.s)), s => !s.includes('dietary') && s.includes('"characters":'));
await expect('it shows no emails, and no phones by default', () => Promise.resolve(JSON.stringify(slShared.s)), s => !s.includes('@x.com') && !s.includes('919-555-0111') && s.includes('"phones":false'));
await expect('opening it is not counted as anyone viewing', () => as(U.c, `select viewed_version from shoot_day_calls where shoot_day_id=$1`, [aday.id]), r => r[0]?.viewed_version === 1);
await expect('opening it is logged as a shared link view', () => as(U.a, `select * from audit_log where action='view' and row_key=$1 and detail like '%shared link'`, [aday.id]), r => r.length === 1 && r[0].actor_id === null);
await as(U.b, `select share_call_sheet($1, true, false, true)`, [aday.id]);
await expect('phones show once chosen', () => asAnon(`select call_sheet_for_share($1) s`, [slSh1.t]), r => JSON.stringify(r[0]?.s).includes('919-555-0111'));
const [slSh2] = await as(U.b, `select share_call_sheet($1, true, true) t`, [aday.id]);
await expect('a new link replaces the old one', () => asAnon(`select call_sheet_for_share($1) s`, [slSh1.t]), r => slSh2.t !== slSh1.t && r[0]?.s === null);
await expect('the new link works', () => asAnon(`select call_sheet_for_share($1) s`, [slSh2.t]), r => r[0]?.s?.day?.id === aday.id);
await as(U.b, `select share_call_sheet($1, false)`, [aday.id]);
await expect('turning it off stops the link', () => asAnon(`select call_sheet_for_share($1) s`, [slSh2.t]), r => r[0]?.s === null);
await expect('unknown shared links show nothing', () => asAnon(`select call_sheet_for_share(gen_random_uuid()) s`), r => r[0]?.s === null);
await expect('turning it on, off and changing it is logged without the code', () => as(U.a, `select * from audit_log where table_name='shoot_days' and row_key=$1 and action='update' and before ? 'shared_link' order by id`, [aday.id]),
  r => r.length === 4 && r[1].after.shared_link === 'On' && r[2].after.shared_link === 'New link' && r.every((x) => x.actor_id === U.b) && JSON.stringify(r[0].changed) === '["shared_link"]' && r[3].after.shared_link === 'Off' && !JSON.stringify(r).includes(slSh1.t) && !JSON.stringify(r).includes(slSh2.t));
const [slUnsent] = await as(U.b, `insert into shoot_days (project_id,shoot_date) values ($1,'2027-04-02') returning id`, [ap.id]);
const [slSh3] = await as(U.b, `select share_call_sheet($1, true) t`, [slUnsent.id]);
await expect('a sheet not sent yet does not open from its shared link', () => asAnon(`select call_sheet_for_share($1) s`, [slSh3.t]), r => r[0]?.s === null);
// deleting a project keeps its log
await as(U.a, `delete from projects where id=$1`, [ap.id]);
await expect('deleting a project keeps its log, with its company', () => as(U.a, `select count(*)::int n from audit_log where project_id=$1 and company_id=$2`, [ap.id, ac.id]), r => r[0].n > 10);
await expect('things deleted with the project are logged in the same group', () => as(U.a, `select count(*)::int n from audit_log where tx=(select tx from audit_log where table_name='projects' and row_key=$1 and action='delete')`, [ap.id]), r => r[0].n >= 5);
// clean-up
await expect('non-admins cannot clean up', () => as(U.b, `select audit_cleanup($1)`, [ac.id]), isErr);
const jBefore = (await as(U.a, `select count(*)::int n from audit_log where company_id=$1 and table_name='journal_entries'`, [ac.id]))[0].n;
await expect('admins can remove entries of one kind', () => as(U.a, `select audit_cleanup($1, null, 'journal_entries') n`, [ac.id]), r => r[0].n === jBefore && jBefore > 0);
await expect('clean-up leaves its own entry', () => as(U.a, `select * from audit_log where action='cleanup' and company_id=$1`, [ac.id]), r => r.length === 1 && r[0].actor_id === U.a && r[0].after.removed === jBefore);
await expect('clean-up also removes the private content', () => db.query(`select count(*)::int n from audit_private p join audit_log l on l.id=p.audit_id where l.row_key=$1`, [pj.id]).then((r) => r.rows), r => r[0].n === 0);
await as(U.a, `select audit_cleanup($1)`, [ac.id]);
await expect('clean-up entries are never removed', () => as(U.a, `select action from audit_log where company_id=$1`, [ac.id]), r => r.length === 2 && r.every((x) => x.action === 'cleanup'));
await expect('clean-up of everything includes the company\'s people', () => as(U.a, `select * from audit_log where action='sign_in' and subject_user_id=$1`, [U.c]), len(0));
// ---- elements ----
const [ec] = await as(U.a, `insert into companies (name) values ('Element Co') returning id`);
await as(U.a, `insert into company_members (company_id,user_id) values ($1,$2),($1,$3)`, [ec.id, U.b, U.c]);
await expect('a new company gets element categories', () => as(U.b, `select name from element_categories where company_id=$1 order by sort_order`, [ec.id]), r => r.length === 12 && r[0].name === 'Props');
await expect('only admins add element categories', () => as(U.b, `insert into element_categories (company_id,name) values ($1,'Drones')`, [ec.id]), isErr);
const [eDrones] = await as(U.a, `insert into element_categories (company_id,name,sort_order) values ($1,' Drones ',13) returning *`, [ec.id]);
await expect('category name tidied', () => Promise.resolve([eDrones]), r => r[0].name === 'Drones');
const [eOther] = await as(U.a, `select id from element_categories where company_id=$1 and name='Props'`, [cc.id]);
const [ep] = await as(U.a, `insert into projects (company_id,name) values ($1,'Element Film') returning id`, [ec.id]);
await as(U.a, `insert into project_members (project_id,user_id) values ($1,$2)`, [ep.id, U.b]);
const [eChar] = await as(U.b, `insert into characters (project_id,name,actor_id) values ($1,'Ellie',$2) returning id`, [ep.id, U.b]);
const [eLoc] = await as(U.b, `insert into project_locations (project_id,name) values ($1,'Ranger station') returning id`, [ep.id]);
const [eSc1] = await as(U.b, `insert into scenes (project_id,number) values ($1,'1') returning id`, [ep.id]);
const [eSc2] = await as(U.b, `insert into scenes (project_id,number) values ($1,'2') returning id`, [ep.id]);
const [el1] = await as(U.b, `insert into elements (project_id,name,category_id,description,character_id,quantity,owner_id) values ($1,'  Hero drone ',$2,'  ',$3,2,$4) returning *`, [ep.id, eDrones.id, eChar.id, U.b]);
await expect('member adds an element, tidied, needed', () => Promise.resolve([el1]), r => r[0].name === 'Hero drone' && r[0].description === null && r[0].status === 'needed' && r[0].created_by === U.b);
await expect('outsider cannot add an element', () => as(U.c, `insert into elements (project_id,name) values ($1,'Nope')`, [ep.id]), isErr);
await expect('outsider cannot see elements', () => as(U.c, `select * from elements where project_id=$1`, [ep.id]), len(0));
await expect('category from another company refused', () => as(U.b, `update elements set category_id=$1 where id=$2`, [eOther.id, el1.id]), isErr);
await expect('character from another project refused', () => as(U.b, `update elements set character_id=$1 where id=$2`, [otherCh.id, el1.id]), isErr);
await expect('location from another project refused', () => as(U.b, `update elements set location_id=$1 where id=$2`, [sdLoc.id, el1.id]), isErr);
await expect('owner must be on the team', () => as(U.b, `update elements set owner_id=$1 where id=$2`, [U.c, el1.id]), isErr);
await expect('a location of its own project', () => as(U.b, `update elements set location_id=$1, status='sourced' where id=$2 returning status`, [eLoc.id, el1.id]), r => r[0]?.status === 'sourced');
await expect('element links to scenes', () => as(U.b, `insert into scene_elements (scene_id,element_id,note) values ($1,$3,' Crashes into the lake '),($2,$3,null) returning project_id, note`, [eSc1.id, eSc2.id, el1.id]), r => r.length === 2 && r[0].project_id === ep.id && r[0].note === 'Crashes into the lake');

await expect('element from another project cannot go in a scene', () => as(U.a, `insert into scene_elements (scene_id,element_id) values ($1,(select id from elements where project_id<>$2 limit 1))`, [eSc1.id, ep.id]), isErr);
await expect('category usage counts elements', () => as(U.a, `select elements::int n from element_category_usage($1) where id=$2`, [ec.id, eDrones.id]), r => r[0]?.n === 1);
// on the call sheet
await makeCrew(ep.id, U.b);
const [eDay] = await as(U.b, `insert into shoot_days (project_id,shoot_date) values ($1,'2027-05-01') returning id`, [ep.id]);
await as(U.b, `insert into shoot_day_items (shoot_day_id,kind,scene_id) values ($1,'scene',$2)`, [eDay.id, eSc2.id]);
const [el2] = await as(U.b, `insert into elements (project_id,name) values ($1,'Rowboat') returning id`, [ep.id]);
await as(U.b, `insert into scene_elements (scene_id,element_id) values ($1,$2)`, [eSc1.id, el2.id]);
await as(U.b, `insert into shoot_day_calls (shoot_day_id,user_id) values ($1,$2)`, [eDay.id, U.b]);
await as(U.b, `select publish_call_sheet($1)`, [eDay.id]);
await expect('the project\'s sheet lists the day\'s elements only', () => as(U.b, `select call_sheet_elements($1) e`, [eDay.id]),
  r => r[0]?.e?.length === 1 && r[0].e[0].name === 'Hero drone' && r[0].e[0].category === 'Drones' && r[0].e[0].character?.actor_id === U.b && r[0].e[0].scenes.length === 1 && r[0].e[0].scenes[0].number === '2');
await expect('outsiders get no elements', () => as(U.c, `select call_sheet_elements($1) e`, [eDay.id]), r => r[0]?.e?.length === 0);
await expect('nobody calls the inner function', () => as(U.b, `select shoot_day_elements_json($1)`, [eDay.id]), isErr);
const [eTok] = await as(U.b, `select link_token from shoot_day_calls where shoot_day_id=$1`, [eDay.id]);
await expect('a personal link lists them', () => asAnon(`select call_sheet_for_link($1) s`, [eTok.link_token]), r => r[0]?.s?.elements?.[0]?.name === 'Hero drone');
const [eShare] = await as(U.b, `select share_call_sheet($1, true) t`, [eDay.id]);
await expect('the shared link lists them', () => asAnon(`select call_sheet_for_share($1) s`, [eShare.t]), r => r[0]?.s?.elements?.length === 1);
await expect('element changes are logged', () => as(U.a, `select table_name from audit_log where table_name in ('element_categories','elements','scene_elements') and (project_id=$1 or company_id=$2)`, [ep.id, ec.id]),
  r => ['element_categories', 'elements', 'scene_elements'].every((t) => r.some((x) => x.table_name === t)));
await expect('member cannot delete someone else\'s element', () => as(U.a, `insert into project_members (project_id,user_id) values ($1,$2)`, [ep.id, U.c]).then(() => as(U.c, `delete from elements where id=$1 returning id`, [el1.id])), len(0));
await as(U.a, `delete from element_categories where id=$1`, [eDrones.id]);
await expect('deleting a category keeps its elements', () => as(U.b, `select category_id from elements where id=$1`, [el1.id]), r => r[0]?.category_id === null);
await as(U.b, `delete from characters where id=$1`, [eChar.id]);
await expect('deleting a character keeps its elements', () => as(U.b, `select character_id from elements where id=$1`, [el1.id]), r => r.length === 1 && r[0].character_id === null);
await as(U.b, `delete from scenes where id=$1`, [eSc1.id]);
await expect('deleting a scene removes its links', () => as(U.b, `select count(*)::int n from scene_elements where element_id=$1`, [el1.id]), r => r[0].n === 1);
await as(U.b, `delete from elements where id=$1`, [el1.id]);
await expect('the creator deletes an element, with its links', () => as(U.b, `select count(*)::int n from scene_elements where scene_id=$1`, [eSc2.id]), r => r[0].n === 0);
await expect('characters no longer hold wardrobe, hair or props', () => db.query(`select column_name from information_schema.columns where table_name='characters' and column_name in ('wardrobe','hair_makeup','props')`).then((r) => r.rows), len(0));
// ---- call sheets by cast and crew ----
const [vc] = await as(U.a, `insert into companies (name) values ('View Co') returning id`);
await as(U.a, `insert into company_members (company_id,user_id) values ($1,$2),($1,$3),($1,$4)`, [vc.id, U.b, U.c, U.d]);
const [vp] = await as(U.a, `insert into projects (company_id,name) values ($1,'View Film') returning id`, [vc.id]);
await as(U.a, `insert into project_members (project_id,user_id) values ($1,$2),($1,$3),($1,$4),($1,$5)`, [vp.id, U.a, U.b, U.c, U.d]);
const roleIn = (uid, rid) => as(U.a, `insert into project_member_roles values ($1,$2,$3)`, [vp.id, uid, rid]);
const viewOf = (uid) => as(uid, `select my_project_view($1) v`, [vp.id]).then((r) => r[0].v);
await expect('no roles counts as cast', () => viewOf(U.c), (v) => v === 'cast');
await expect('an admin is crew', () => viewOf(U.a), (v) => v === 'crew');
await roleIn(U.b, crewRole); await roleIn(U.c, castRole); await roleIn(U.d, castRole);
await expect('a crew role is crew', () => viewOf(U.b), (v) => v === 'crew');
await expect('a Cast role is cast', () => viewOf(U.c), (v) => v === 'cast');
await roleIn(U.d, crewRole);
await expect('cast and crew roles are both', () => viewOf(U.d), (v) => v === 'both');
await as(U.a, `insert into characters (project_id,name,actor_id) values ($1,'Pilot',$2)`, [vp.id, U.b]);
await expect('playing a character makes crew both', () => viewOf(U.b), (v) => v === 'both');
await as(U.a, `delete from characters where project_id=$1`, [vp.id]);
await expect('nobody else asks about another person', () => as(U.b, `select project_view_of($1,$2)`, [vp.id, U.c]), isErr);
const [vDay] = await as(U.b, `insert into shoot_days (project_id,shoot_date) values ($1,'2027-06-01') returning id`, [vp.id]);
await as(U.b, `insert into shoot_day_calls (shoot_day_id,user_id,note) values ($1,$2,'Bring the drone'),($1,$3,'Wardrobe at 6'),($1,$4,null)`, [vDay.id, U.b, U.c, U.d]);
await as(U.b, `select publish_call_sheet($1)`, [vDay.id]);
await expect('cast see only their own call', () => as(U.c, `select user_id, note from shoot_day_calls where shoot_day_id=$1`, [vDay.id]), r => r.length === 1 && r[0].user_id === U.c);
await expect('crew see every call', () => as(U.b, `select * from shoot_day_calls where shoot_day_id=$1`, [vDay.id]), len(3));
await expect('both see every call', () => as(U.d, `select * from shoot_day_calls where shoot_day_id=$1`, [vDay.id]), len(3));
await expect('cast still see the day', () => as(U.c, `select id from shoot_days where id=$1`, [vDay.id]), len(1));
await expect('cast cannot add a day', () => as(U.c, `insert into shoot_days (project_id,shoot_date) values ($1,'2027-06-02')`, [vp.id]), isErr);
await expect('cast cannot change a day', () => as(U.c, `update shoot_days set title='Mine' where id=$1 returning id`, [vDay.id]), len(0));
await expect('cast cannot delete a day', () => as(U.c, `delete from shoot_days where id=$1 returning id`, [vDay.id]), len(0));
await expect('cast cannot add to the schedule', () => as(U.c, `insert into shoot_day_items (shoot_day_id,kind,label) values ($1,'note','Hi')`, [vDay.id]), isErr);
const [vLoc] = await as(U.a, `insert into project_locations (project_id,name) values ($1,'Barn') returning id`, [vp.id]);
await expect('cast cannot add a day location', () => as(U.c, `insert into shoot_day_locations (shoot_day_id,location_id) values ($1,$2)`, [vDay.id, vLoc.id]), isErr);
await as(U.a, `insert into shoot_day_locations (shoot_day_id,location_id) values ($1,$2)`, [vDay.id, vLoc.id]);
await expect('cast see the day locations', () => as(U.c, `select * from shoot_day_locations where shoot_day_id=$1`, [vDay.id]), len(1));
await expect('cast cannot remove a day location', () => as(U.c, `delete from shoot_day_locations where shoot_day_id=$1 returning location_id`, [vDay.id]), len(0));
await expect('a day location change is logged on the day', () => as(U.a, `select * from audit_log where table_name='shoot_day_locations' and parent_key=$1`, [vDay.id]), r => r.length === 1 && r[0].item_label === 'Barn' && r[0].parent_table === 'shoot_days');
await expect('deleting a location takes it off its days', async () => { await as(U.a, `delete from project_locations where id=$1`, [vLoc.id]); return as(U.a, `select * from shoot_day_locations where shoot_day_id=$1`, [vDay.id]); }, len(0));
await expect('cast cannot change their own call', () => as(U.c, `update shoot_day_calls set note='Late' where shoot_day_id=$1 returning note`, [vDay.id]), len(0));
await expect('cast cannot call people', () => as(U.c, `insert into shoot_day_calls (shoot_day_id,user_id) values ($1,$2)`, [vDay.id, U.a]), isErr);
await expect('cast cannot send the call sheet', () => as(U.c, `select publish_call_sheet($1)`, [vDay.id]), isErr);
await expect('cast confirm their own call', () => as(U.c, `select mark_call_sheet($1,true)`, [vDay.id]).then(() => as(U.b, `select confirmed_version from shoot_day_calls where shoot_day_id=$1 and user_id=$2`, [vDay.id, U.c])), r => r[0]?.confirmed_version === 1);
const linkOf = (uid) => db.query(`select link_token from shoot_day_calls where shoot_day_id=$1 and user_id=$2`, [vDay.id, uid]).then((r) => r.rows[0].link_token);
const sheetOf = async (uid) => (await asAnon(`select call_sheet_for_link($1) s`, [await linkOf(uid)]))[0].s;
await expect('a cast personal link has only their call', () => sheetOf(U.c), s => s.view === 'cast' && s.calls.length === 1 && s.calls[0].user_id === U.c && s.roles.length === 1);
await expect('a crew personal link has everyone', () => sheetOf(U.b), s => s.view === 'crew' && s.calls.length === 3);
await expect('a both personal link has everyone, to switch', () => sheetOf(U.d), s => s.view === 'both' && s.calls.length === 3);
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
