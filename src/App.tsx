import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { supabase, supabaseConfigured } from './lib/supabase';
import { SignIn } from './pages/SignIn';
import { Home } from './pages/Home';
import { CompanyPage } from './pages/CompanyPage';
import { ProjectPage } from './pages/ProjectPage';
import { ProfilePage } from './pages/ProfilePage';
import { RolesPage } from './pages/RolesPage';
import { ThemeSwitch } from './components/ThemeSwitch';

export function App() {
  const { session, loading } = useAuth();

  if (!supabaseConfigured)
    return (
      <main className="grid min-h-dvh place-items-center p-4">
        <div className="card w-full max-w-sm">
          <h1>Setup needed</h1>
          <p>Copy <code>.env.example</code> to <code>.env.local</code> and add your Supabase URL and publishable key.</p>
        </div>
      </main>
    );
  if (loading) return <main className="grid min-h-dvh place-items-center p-4"><p className="text-muted">Loading…</p></main>;
  if (!session) return <SignIn />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-1">
        <Link to="/" className="mr-auto font-bold text-fg no-underline">Movie Production</Link>
        <Link to="/profile" className="btn-link text-sm text-muted no-underline">
          <span className="sm:hidden">Profile</span>
          <span className="hidden sm:inline">{session.user.email}</span>
        </Link>
        <ThemeSwitch />
        <button className="btn-link text-sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        <Routes>
          <Route path="/companies/:companyId" element={<CompanyPage />} />
          <Route path="/companies/:companyId/roles" element={<RolesPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
