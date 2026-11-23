import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { supabase, supabaseConfigured } from './lib/supabase';
import { SignIn } from './pages/SignIn';
import { Home } from './pages/Home';
import { CompanyPage } from './pages/CompanyPage';
import { ProjectPage } from './pages/ProjectPage';
import { ProfilePage } from './pages/ProfilePage';

export function App() {
  const { session, loading } = useAuth();

  if (!supabaseConfigured)
    return (
      <main className="auth">
        <div className="card">
          <h1>Setup needed</h1>
          <p>Copy <code>.env.example</code> to <code>.env.local</code> and add your Supabase URL and publishable key.</p>
        </div>
      </main>
    );
  if (loading) return <main className="auth"><p className="muted">Loading…</p></main>;
  if (!session) return <SignIn />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <header className="topbar">
        <Link to="/" className="brand">Movie Production</Link>
        <span className="spacer" />
        <Link to="/profile" className="muted">{session.user.email}</Link>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <main className="page">
        <Routes>
          <Route path="/companies/:companyId" element={<CompanyPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
