// Checks the database schema and security rules against an in-memory Postgres.
// Run with: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create role authenticated;
create role anon;
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
await expect('unknown email rejected', () => as(U.a, `select add_company_member($1,'nobody@x.com')`, [c2]), e => isErr(e) && /sign up first/.test(e.message));
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
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
