import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
