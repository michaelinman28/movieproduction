import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';

/**
 * The app's version: the number of the pull request whose merge was published. Production
 * builds from main read it from the latest merge commit ("Merge pull request #59 from …",
 * or a squash merge's "… (#59)"); a Deploy Preview uses its own PR number. Falls back to
 * the commit, or "dev" when there's no git.
 */
function appVersion() {
  if (process.env.REVIEW_ID) return process.env.REVIEW_ID;
  try {
    const subjects = execSync('git log -n 50 --format=%s', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n');
    for (const s of subjects) {
      const m = s.match(/^Merge pull request #(\d+)\b/) ?? s.match(/\(#(\d+)\)$/);
      if (m) return m[1];
    }
    return (process.env.COMMIT_REF ?? execSync('git rev-parse HEAD', { encoding: 'utf8' })).trim().slice(0, 7);
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Netlify and local dev serve the app from /. Set BASE_PATH to host it under a sub-path.
  base: loadEnv(mode, '.', 'BASE_PATH').BASE_PATH || '/',
  // Netlify sets these while building: CONTEXT is production, deploy-preview or
  // branch-deploy, and REVIEW_ID is the pull request number on a Deploy Preview.
  define: {
    __DEPLOY_CONTEXT__: JSON.stringify(process.env.CONTEXT ?? ''),
    __REVIEW_ID__: JSON.stringify(process.env.REVIEW_ID ?? ''),
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
}));
