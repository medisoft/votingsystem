import type { ApiErrorBody } from './types';

/** Empty by default so browsers use the hostname that served the UI. */
export const apiUrl = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(readonly body: ApiErrorBody) {
    super(body.code ?? 'REQUEST_FAILED');
  }
}

/**
 * Performs a same-origin JSON request with the admin session cookie.
 *
 * @param path - API path beginning with `/api/v1`.
 * @param init - Optional fetch init. JSON content-type is set when a body is present.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('x-requested-with', 'XMLHttpRequest');
  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(apiUrl + path, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!response.ok)
    throw new ApiError(
      (await response.json().catch(() => ({
        code: 'REQUEST_FAILED',
      }))) as ApiErrorBody,
    );
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
