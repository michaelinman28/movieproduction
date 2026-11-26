import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Netlify and local dev serve the app from /. Set BASE_PATH to host it under a sub-path.
  base: loadEnv(mode, '.', 'BASE_PATH').BASE_PATH || '/',
  // Netlify sets these while building: CONTEXT is production, deploy-preview or
  // branch-deploy, and REVIEW_ID is the pull request number on a Deploy Preview.
  define: {
    __DEPLOY_CONTEXT__: JSON.stringify(process.env.CONTEXT ?? ''),
    __REVIEW_ID__: JSON.stringify(process.env.REVIEW_ID ?? ''),
  },
}));
