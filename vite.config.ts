import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // GitHub Pages serves the app from /movieproduction/; local dev uses /.
  base: loadEnv(mode, '.', 'BASE_PATH').BASE_PATH || '/',
}));
