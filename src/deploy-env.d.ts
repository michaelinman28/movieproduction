/** Set at build time from Netlify's CONTEXT and REVIEW_ID (empty strings elsewhere). */
declare const __DEPLOY_CONTEXT__: string;
declare const __REVIEW_ID__: string;
/** The pull request number this build was published from (see appVersion in vite.config.ts). */
declare const __APP_VERSION__: string;
