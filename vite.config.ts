import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Netlify and local dev serve the app from /. Set BASE_PATH to host it under a sub-path.
  base: loadEnv(mode, '.', 'BASE_PATH').BASE_PATH || '/',
}));
