/** Development CSP. `'unsafe-eval'` is required for Vite HMR. */
export const DEV_ADMIN_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/** Production CSP for the Vite build. No eval. */
export const PROD_ADMIN_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/**
 * Replaces the development CSP meta content with the production policy.
 *
 * @param html - Source or built index.html.
 * @returns HTML whose CSP meta tag uses PROD_ADMIN_CSP.
 */
export function applyProductionAdminCsp(html: string): string {
  if (!html.includes(DEV_ADMIN_CSP))
    throw new Error('index.html CSP does not match DEV_ADMIN_CSP');
  return html.replace(DEV_ADMIN_CSP, PROD_ADMIN_CSP);
}
