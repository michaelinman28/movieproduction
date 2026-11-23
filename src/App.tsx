import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { supabase, supabaseConfigured } from './lib/supabase';
import { SignIn } from './pages/SignIn';
import { Home } from './pages/Home';

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
    <BrowserRouter>
      <header className="topbar">
        <strong>Movie Production</strong>
        <span className="spacer" />
        <span className="muted">{session.user.email}</span>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <main className="page">
        <Routes>
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
