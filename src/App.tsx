import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { supabase, supabaseConfigured } from './lib/supabase';
import { SignIn } from './pages/SignIn';
import { Home } from './pages/Home';
import { CompanyPage } from './pages/CompanyPage';
import { ProjectJournal, ProjectLayout } from './pages/project/ProjectLayout';
import { ProjectNotes } from './pages/project/ProjectNotes';
import { ProjectLocationsPage, ProjectOverview, ProjectTasks } from './pages/project/ProjectOverview';
import { ProjectTeam } from './pages/project/ProjectTeam';
import { ProjectScenes } from './pages/project/ProjectScenes';
import { ProjectCharacters } from './pages/project/ProjectCharacters';
import { ProjectElements } from './pages/project/ProjectElements';
import { ProjectShootDays } from './pages/project/ProjectShootDays';
import { CallSheetPage } from './pages/project/CallSheetPage';
import { ProfilePage } from './pages/ProfilePage';
import { RolesPage } from './pages/RolesPage';
import { TaskSettingsPage } from './pages/TaskSettingsPage';
import { ActivityPage } from './pages/ActivityPage';
import { ProjectActivity } from './pages/project/ProjectActivity';
import { SheetLinkPage } from './pages/SheetLinkPage';
import { SharedSheetPage } from './pages/SharedSheetPage';
import { ThemeSwitch } from './components/ThemeSwitch';
import { HeaderAccount } from './components/HeaderAccount';
import { PinnedAction } from './components/PinnedAction';
import { FormScroller } from './components/FormScroller';
import { UnsavedGuard } from './components/UnsavedGuard';
import { PreviewBanner } from './components/PreviewBanner';
import { BackLink, LinkOutTracker } from './components/BackLink';
import { HelpLink } from './components/HelpLink';

// The Help pages load only when someone opens them.
const HelpApp = lazy(() => import('./help/HelpApp'));

/** The path inside the app, without the base the site is served under. */
const appPath = () => window.location.pathname.slice(import.meta.env.BASE_URL.replace(/\/$/, '').length);

/** Help (/help and its pages) is public: it opens with or without signing in. */
const isHelp = () => /^\/help(\/|$)/.test(appPath());

/** Call sheet links open on their own page, with no sign-in: personal (/sheet/:token) or shared (/call-sheet/:token). */
function sheetToken() {
  const m = appPath().match(/^\/(sheet|call-sheet)\/([0-9a-f-]{36})\/?$/i);
  return m ? { shared: m[1].toLowerCase() === 'call-sheet', token: m[2] } : null;
}

export function App() {
  const { session, loading } = useAuth();
  const token = sheetToken();

  if (!supabaseConfigured)
    return (
      <main className="grid flex-1 place-items-center p-4">
        <div className="card w-full max-w-sm">
          <h1>Setup needed</h1>
          <p>Copy <code>.env.example</code> to <code>.env.local</code> and add your Supabase URL and publishable key.</p>
        </div>
      </main>
    );
  if (token) return token.shared ? <SharedSheetPage token={token.token} /> : <SheetLinkPage token={token.token} />;
  if (isHelp())
    return (
      <Suspense fallback={<main className="grid flex-1 place-items-center p-4"><p className="text-muted">Loading help…</p></main>}>
        <HelpApp signedIn={!!session} />
      </Suspense>
    );
  if (loading) return <main className="grid flex-1 place-items-center p-4"><p className="text-muted">Loading…</p></main>;
  if (!session) return <><PreviewBanner /><SignIn /></>;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <PreviewBanner />
      <header className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-1">
        <Link to="/" className="mr-auto shrink-0 font-bold text-fg no-underline">Movie Production</Link>
        <HelpLink />
        <HeaderAccount email={session.user.email} />
        <ThemeSwitch />
        <button className="btn-link shrink-0 whitespace-nowrap text-sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <PinnedAction />
      <FormScroller />
      <UnsavedGuard />
      <LinkOutTracker />
      <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 md:py-8">
        <BackLink />
        <Routes>
          <Route path="/companies/:companyId" element={<CompanyPage />} />
          <Route path="/companies/:companyId/roles" element={<RolesPage />} />
          <Route path="/companies/:companyId/task-settings" element={<TaskSettingsPage />} />
          <Route path="/companies/:companyId/activity" element={<ActivityPage />} />
          <Route path="/projects/:projectId" element={<ProjectLayout />}>
            <Route index element={<ProjectOverview />} />
            <Route path="tasks" element={<ProjectTasks />} />
            <Route path="scenes" element={<ProjectScenes />} />
            <Route path="characters" element={<ProjectCharacters />} />
            <Route path="elements" element={<ProjectElements />} />
            <Route path="shoot-days" element={<ProjectShootDays />} />
            <Route path="shoot-days/:dayId" element={<CallSheetPage />} />
            <Route path="locations" element={<ProjectLocationsPage />} />
            <Route path="team" element={<ProjectTeam />} />
            <Route path="notes" element={<ProjectNotes />} />
            <Route path="journal" element={<ProjectJournal />} />
            <Route path="activity" element={<ProjectActivity />} />
          </Route>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
