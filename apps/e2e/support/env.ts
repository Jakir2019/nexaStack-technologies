import { fileURLToPath } from 'node:url';

/**
 * Shared constants for the browser tier. Ports are FIXED (Playwright reads `baseURL` before `globalSetup`
 * runs), high and unusual so they do not collide with a developer's `pnpm dev` on 3000/4000; global setup
 * refuses to start if either is already taken.
 */

export const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 3210);
export const API_PORT = Number(process.env['E2E_API_PORT'] ?? 4210);
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

/** Cloudflare's PUBLISHED Turnstile test keys: the widget always passes, no real challenge, needs internet. */
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
export const TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

export const ROLES = ['super_admin', 'admin', 'content_editor'] as const;
export type Role = (typeof ROLES)[number];

/** Obviously synthetic accounts that exist only in the throwaway test database. */
export const ADMINS: Record<Role, { email: string; password: string }> = {
  super_admin: { email: 'e2e-super-admin@example.com', password: 'E2e-Super-Password-1' },
  admin: { email: 'e2e-admin@example.com', password: 'E2e-Admin-Password-1' },
  content_editor: { email: 'e2e-editor@example.com', password: 'E2e-Editor-Password-1' },
};

/** Where global setup writes each role's signed-in browser state (cookies), for tests to reuse. */
export const AUTH_DIR = new URL('../.auth/', import.meta.url);
export const authFile = (role: Role) =>
  fileURLToPath(new URL(`${role}.json`, AUTH_DIR));

/** Written by global setup: facts about the seeded content and the Turnstile round trip. */
export const STATE_FILE = fileURLToPath(new URL('../.auth/state.json', import.meta.url));

export interface E2eState {
  /** False when challenges.cloudflare.com could not be reached, so tests needing the widget must skip. */
  turnstileReachable: boolean;
  publishedPost: { id: string; slug: string; title: string };
  draftPost: { id: string; slug: string; title: string };
  archivedPost: { id: string; slug: string; title: string };
  categoryId: string;
}
