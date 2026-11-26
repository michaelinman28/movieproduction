/**
 * A thin bar shown only on Netlify Deploy Previews, so a PR's preview is never mistaken
 * for the live app. Netlify sets CONTEXT and REVIEW_ID at build time (see vite.config.ts).
 */
export function PreviewBanner() {
  if (__DEPLOY_CONTEXT__ !== 'deploy-preview') return null;
  return (
    <div className="no-print bg-accent-soft px-4 py-1 text-center text-sm text-accent-strong">
      Preview of {__REVIEW_ID__ ? `PR #${__REVIEW_ID__}` : 'a pull request'}. Changes here use the live data.
    </div>
  );
}
