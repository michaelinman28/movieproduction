import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { findPage } from './content';

type Item = { name: string; line: string; page?: string };

/** A box; it links to its help page once that page exists ("section/slug"). */
function Box({ item, main = false }: { item: Item; main?: boolean }) {
  const [section, slug] = (item.page ?? '').split('/');
  const page = item.page ? findPage(section, slug) : undefined;
  const body = (
    <>
      <span className="font-semibold text-fg">{item.name}</span>
      <span className="text-sm text-muted">{item.line}</span>
    </>
  );
  const cls = `flex min-w-0 flex-col gap-0.5 rounded-lg border p-3 ${main ? 'border-2 border-accent bg-accent-soft' : 'border-line bg-surface'}`;
  return page ? <Link to={page.path} className={`${cls} no-underline hover:border-accent`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Group({ title, children, cols }: { title: string; children: ReactNode; cols: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg p-3">
      <p className="m-0 mb-2 font-semibold">{title}</p>
      <div className={`grid gap-2 ${cols}`}>{children}</div>
    </div>
  );
}

const Down = () => <div className="flex justify-center text-muted" aria-hidden="true"><span className="text-xl leading-none">↓</span></div>;

/** "The big picture": what a company and its team set up flows down into each day's call sheet. */
export function BigPicture() {
  return (
    <figure className="m-0 flex flex-col gap-2" aria-label="How the features connect, from the company down to the call sheet">
      <Group title="Company" cols="grid-cols-2 lg:grid-cols-4">
        <Box item={{ name: 'People', line: 'Added by email', page: 'company/people' }} />
        <Box item={{ name: 'Roles', line: 'Standard and custom', page: 'company/roles' }} />
        <Box item={{ name: 'Categories and tags', line: 'Sort every task', page: 'company/task-categories-and-tags' }} />
        <Box item={{ name: 'Activity log', line: 'Every change, for admins', page: 'company/activity-log' }} />
      </Group>
      <Down />
      <div className="mx-auto w-full max-w-md"><Box item={{ name: 'Team', line: 'People on this project, with their project roles', page: 'project/team' }} /></div>
      <Down />
      <Group title="Plan the shoot" cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Box item={{ name: 'Tasks', line: 'Assigned to someone on the team, at a location', page: 'project/tasks' }} />
        <Box item={{ name: 'Scenes', line: 'Characters, elements, location and shot list', page: 'project/scenes' }} />
        <Box item={{ name: 'Characters', line: 'Played by someone on the team, with a cast number', page: 'project/characters' }} />
        <Box item={{ name: 'Elements', line: 'Props, wardrobe and more, linked to scenes', page: 'project/elements' }} />
        <Box item={{ name: 'Locations', line: 'Address, contact, parking, nearest hospital', page: 'project/locations' }} />
      </Group>
      <Down />
      <div className="mx-auto w-full max-w-lg"><Box item={{ name: 'Shoot days', line: 'Times, weather and locations; the schedule of scenes; who is called', page: 'project/shoot-days' }} /></div>
      <Down />
      <div className="mx-auto w-full max-w-md"><Box main item={{ name: 'Call sheet', line: 'Send a version; each person confirms', page: 'project/call-sheets' }} /></div>
      <Down />
      <div className="grid gap-2 sm:grid-cols-3">
        <Box item={{ name: 'Personal links', line: 'No sign-in; confirm your call', page: 'getting-started/your-call-sheet-link' }} />
        <Box item={{ name: 'Shared link', line: 'The whole day, view only', page: 'project/call-sheet-links' }} />
        <Box item={{ name: 'Print or PDF', line: 'Laid out on US Letter paper', page: 'project/call-sheets' }} />
      </div>
      <figcaption className="mt-2 text-sm text-muted">
        Alongside the chain: notes on tasks, scenes, shots, days and calls all collect on Project notes, and every change is kept in the Activity log.
      </figcaption>
    </figure>
  );
}
