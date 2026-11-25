import path from 'node:path';

/** Saved GitHub session (cookies). Gitignored - never commit it. */
export const GITHUB_AUTH_FILE = path.join(__dirname, '..', '.auth', 'github-user.json');

/** URL of the last successful deploy (read from the run summary). Used by the app checks that follow. */
export const DEPLOYED_URL_FILE = path.join(__dirname, '..', '.auth', 'deployed-url.txt');
