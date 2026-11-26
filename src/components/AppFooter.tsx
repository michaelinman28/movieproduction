/**
 * The footer on every page: the software's name and the version published, which is the
 * number of the pull request it came from (a Deploy Preview shows its own PR number).
 */
export function AppFooter() {
  const preview = __DEPLOY_CONTEXT__ === 'deploy-preview';
  return (
    <footer className="no-print mt-auto border-t border-line px-4 py-3 text-center text-xs text-muted">
      Movie Production Management · Version {__APP_VERSION__}{preview ? ' (preview)' : ''}
    </footer>
  );
}
