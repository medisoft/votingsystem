/** Development CSP. `'unsafe-eval'` is required for Vite HMR. */
export const DEV_CLIENT_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/** Production CSP for the Vite build. No eval. Service worker stays first-party. */
export const PROD_CLIENT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/**
 * Replaces the development CSP meta content with the production policy.
 *
 * @param html - Source or built index.html.
 * @returns HTML whose CSP meta tag uses PROD_CLIENT_CSP.
 */
export function applyProductionClientCsp(html: string): string {
  if (!html.includes(DEV_CLIENT_CSP))
    throw new Error('index.html CSP does not match DEV_CLIENT_CSP');
  return html.replace(DEV_CLIENT_CSP, PROD_CLIENT_CSP);
}
