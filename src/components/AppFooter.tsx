import { helpUrl } from './HelpLink';

/**
 * The footer on every page: the software's name and the version published, which is the
 * number of the pull request it came from (a Deploy Preview shows its own PR number).
 */
export function AppFooter() {
  const preview = __DEPLOY_CONTEXT__ === 'deploy-preview';
  const inHelp = window.location.pathname.startsWith(helpUrl());
  return (
    <footer className="no-print mt-auto border-t border-line px-4 py-3 text-center text-xs text-muted">
      Movie Production Management · Version {__APP_VERSION__}{preview ? ' (preview)' : ''}
      {/* Help opens in a new tab from the app, so nothing being typed is lost. */}
      {' · '}<a href={helpUrl()} {...(inHelp ? {} : { target: '_blank', rel: 'noopener' })}>Help</a>
    </footer>
  );
}
