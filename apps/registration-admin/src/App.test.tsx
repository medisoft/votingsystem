import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { App } from './App';
it('shows login when there is no session', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'UNAUTHENTICATED' }),
    }),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole('heading', { name: 'Sign in' }),
  ).toBeInTheDocument();
});

it('does not send a JSON content type for bodyless logout', async () => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      const path = String(input);
      if (path.endsWith('/api/v1/admin/me')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: '1',
              email: 'admin@example.com',
              role: 'SYSTEM_ADMIN',
              status: 'ACTIVE',
              createdAt: new Date().toISOString(),
            },
          }),
        };
      }
      if (path.endsWith('/api/v1/admin/users')) {
        return { ok: true, status: 200, json: async () => ({ users: [] }) };
      }
      if (path.endsWith('/api/v1/admin/scopes')) {
        return { ok: true, status: 200, json: async () => ({ scopes: [] }) };
      }
      if (path.includes('/api/v1/admin/registrations')) {
        return { ok: true, status: 200, json: async () => ({ records: [] }) };
      }
      return { ok: true, status: 204, json: async () => undefined };
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  const logoutCall = fetchMock.mock.calls.find(([url]) =>
    String(url).endsWith('/api/v1/admin/auth/logout'),
  )!;
  expect((logoutCall[1]!.headers as Headers).has('content-type')).toBe(false);
});
