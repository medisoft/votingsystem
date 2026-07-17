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
  expect(
    await screen.findByRole('heading', { name: 'Import CSV' }),
  ).toBeInTheDocument();
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

it('shows operational failures to registration operators', async () => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/api/v1/admin/me'))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: 'operator-1',
              email: 'operator@example.com',
              role: 'REGISTRATION_OPERATOR',
              status: 'ACTIVE',
              createdAt: new Date().toISOString(),
            },
          }),
        };
      if (path.endsWith('/api/v1/admin/registrations/import/preview'))
        return {
          ok: false,
          status: 400,
          json: async () => ({ code: 'INVALID_IMPORT_REQUEST' }),
        };
      if (path.endsWith('/api/v1/admin/scopes'))
        return { ok: true, status: 200, json: async () => ({ scopes: [] }) };
      if (
        path.endsWith('/api/v1/admin/registrations') &&
        init?.method === 'POST'
      )
        return {
          ok: false,
          status: 409,
          json: async () => ({ code: 'UNIT_EXISTS' }),
        };
      if (path.includes('/api/v1/admin/registrations'))
        return { ok: true, status: 200, json: async () => ({ records: [] }) };
      return { ok: true, status: 200, json: async () => ({}) };
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
  await screen.findByRole('heading', { name: 'Import CSV' });
  fireEvent.change(screen.getByLabelText('Unit'), {
    target: { value: 'A-1' },
  });
  fireEvent.change(screen.getByLabelText('Owner'), {
    target: { value: 'Owner' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create record' }));
  expect(
    await screen.findByText('Unable to save the record: UNIT_EXISTS'),
  ).toHaveAttribute('role', 'status');
});

it('replaces a stale preview after commit revalidation fails', async () => {
  const validPreview = {
    fileHash: 'preview-hash',
    summary: { total: 1, valid: 1, rejected: 0 },
    errors: [],
    rows: [
      {
        row: 2,
        data: { unitNumber: 'A-1', ownerName: 'Owner' },
        errors: [],
      },
    ],
  };
  const invalidPreview = {
    ...validPreview,
    summary: { total: 1, valid: 0, rejected: 1 },
    rows: [
      {
        row: 2,
        errors: [
          {
            row: 2,
            field: 'unit_number',
            code: 'DUPLICATE_EXISTING',
            message: 'Unit identifier already exists.',
          },
        ],
      },
    ],
  };
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/api/v1/admin/me'))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: 'operator-2',
              email: 'operator2@example.com',
              role: 'REGISTRATION_OPERATOR',
              status: 'ACTIVE',
              createdAt: new Date().toISOString(),
            },
          }),
        };
      if (path.endsWith('/api/v1/admin/registrations/import/preview'))
        return {
          ok: true,
          status: 200,
          json: async () => ({ preview: validPreview }),
        };
      if (
        path.endsWith('/api/v1/admin/registrations/import') &&
        init?.method === 'POST'
      )
        return {
          ok: false,
          status: 400,
          json: async () => ({ code: 'INVALID_CSV', preview: invalidPreview }),
        };
      if (path.endsWith('/api/v1/admin/scopes'))
        return { ok: true, status: 200, json: async () => ({ scopes: [] }) };
      if (path.includes('/api/v1/admin/registrations'))
        return { ok: true, status: 200, json: async () => ({ records: [] }) };
      return { ok: true, status: 200, json: async () => ({}) };
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  const file = new File(['csv'], 'race.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', {
    value: async () => `unit_number,owner_name
A-1,Owner
`,
  });
  const secondFile = new File(['second'], 'second.csv', { type: 'text/csv' });
  const originalFormData = FormData;
  vi.stubGlobal(
    'FormData',
    class {
      get() {
        return file;
      }
    },
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
  const fileInput = await screen.findByLabelText('CSV file');
  fireEvent.change(fileInput, { target: { files: [file] } });
  fireEvent.submit(fileInput.closest('form')!);
  expect(
    await screen.findByText('Total: 1. Valid: 1. Rejected: 0.'),
  ).toBeInTheDocument();
  fireEvent.change(fileInput, { target: { files: [secondFile] } });
  expect(
    screen.queryByRole('button', { name: 'Commit valid rows' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('Total: 1. Valid: 1. Rejected: 0.'),
  ).not.toBeInTheDocument();
  fireEvent.change(fileInput, { target: { files: [file] } });
  fireEvent.submit(fileInput.closest('form')!);
  await screen.findByText('Total: 1. Valid: 1. Rejected: 0.');
  fireEvent.click(screen.getByRole('button', { name: 'Commit valid rows' }));
  expect(
    await screen.findByText('Total: 1. Valid: 0. Rejected: 1.'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Commit valid rows' }),
  ).toBeDisabled();
  expect(screen.getByText('Unable to commit the CSV import.')).toHaveAttribute(
    'role',
    'status',
  );
  vi.stubGlobal('FormData', originalFormData);
});
