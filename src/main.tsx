import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { App } from './App';
import { AppFooter } from './components/AppFooter';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        {/* The page fills the screen and the footer sits at the bottom, even on short pages. */}
        <div className="flex min-h-dvh flex-col">
          <div className="flex flex-1 flex-col">
            <App />
          </div>
          <AppFooter />
        </div>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
