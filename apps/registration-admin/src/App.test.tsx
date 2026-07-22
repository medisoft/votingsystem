import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { App } from './App';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') },
}));
const pdfSave = vi.fn();
const pdfText = vi.fn();
const pdfAddImage = vi.fn();
vi.mock('jspdf', () => ({
  jsPDF: vi.fn(() => ({
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    splitTextToSize: vi.fn((text: string) => [text]),
    text: pdfText,
    addImage: pdfAddImage,
    save: pdfSave,
  })),
}));

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
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
  let previewCalls = 0;
  let commitSucceeds = false;
  let resolveFirstPreview!: (response: MockResponse) => void;
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
      if (path.endsWith('/api/v1/admin/registrations/import/preview')) {
        previewCalls += 1;
        if (previewCalls === 1)
          return new Promise<MockResponse>((resolve) => {
            resolveFirstPreview = resolve;
          });
        return {
          ok: true,
          status: 200,
          json: async () => ({ preview: validPreview }),
        };
      }
      if (
        path.endsWith('/api/v1/admin/registrations/import') &&
        init?.method === 'POST'
      ) {
        if (commitSucceeds)
          return {
            ok: true,
            status: 201,
            json: async () => ({
              import: { importedRows: 1, rejectedRows: 0 },
              errorReportUrl: null,
            }),
          };
        return {
          ok: false,
          status: 400,
          json: async () => ({ code: 'INVALID_CSV', preview: invalidPreview }),
        };
      }
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
  await waitFor(() => expect(resolveFirstPreview).toBeTypeOf('function'));
  fireEvent.change(fileInput, { target: { files: [secondFile] } });
  resolveFirstPreview({
    ok: true,
    status: 200,
    json: async () => ({ preview: validPreview }),
  });
  await screen.findByRole('button', { name: 'Preview import' });
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
  fireEvent.change(fileInput, { target: { files: [file] } });
  fireEvent.submit(fileInput.closest('form')!);
  await screen.findByText('Total: 1. Valid: 1. Rejected: 0.');
  commitSucceeds = true;
  fireEvent.click(screen.getByRole('button', { name: 'Commit valid rows' }));
  expect(
    await screen.findByText('Imported: 1. Rejected: 0.'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Commit valid rows' }),
  ).toBeDisabled();
  vi.stubGlobal('FormData', originalFormData);
});

it('paginates every CSV preview row and exposes errors after row 100', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => {
    const row = index + 2;
    return index === 100
      ? {
          row,
          errors: [
            {
              row,
              field: 'email',
              code: 'INVALID_FIELD',
              message: 'Field value is invalid.',
            },
          ],
        }
      : {
          row,
          data: {
            unitNumber: 'UNIT-' + (index + 1),
            ownerName: 'Owner ' + (index + 1),
          },
          errors: [],
        };
  });
  const preview = {
    fileHash: 'large-preview',
    summary: { total: 101, valid: 100, rejected: 1 },
    errors: Array.from({ length: 101 }, (_, index) => ({
      row: 1,
      field: 'header-' + index,
      code: 'UNKNOWN_HEADER',
      message: 'The column is not supported.',
    })),
    rows,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/api/v1/admin/me'))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: 'operator-3',
              email: 'operator3@example.com',
              role: 'REGISTRATION_OPERATOR',
              status: 'ACTIVE',
              createdAt: new Date().toISOString(),
            },
          }),
        };
      if (path.endsWith('/api/v1/admin/registrations/import/preview'))
        return { ok: true, status: 200, json: async () => ({ preview }) };
      if (path.endsWith('/api/v1/admin/scopes'))
        return { ok: true, status: 200, json: async () => ({ scopes: [] }) };
      if (path.includes('/api/v1/admin/registrations'))
        return { ok: true, status: 200, json: async () => ({ records: [] }) };
      return { ok: true, status: 200, json: async () => ({}) };
    }),
  );
  const file = new File(['csv'], 'large.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => 'csv' });
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
    await screen.findByText('Showing entries 1–100 of 101.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Row 2: UNIT-1 — Owner 1')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Showing the first 100 file-level errors. Correct them and preview the file again to continue.',
    ),
  ).toBeInTheDocument();
  expect(screen.getAllByText(/The column is not supported./)).toHaveLength(100);
  expect(screen.queryByText('Row 102: rejected')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next rows' }));
  expect(
    screen.getByText('Showing entries 101–101 of 101.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Row 102: rejected')).toBeInTheDocument();
  expect(screen.getByText(/^Row 102, email:/)).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Commit valid rows' }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous rows' }));
  expect(screen.getByText('Showing entries 1–100 of 101.')).toBeInTheDocument();
  vi.stubGlobal('FormData', originalFormData);
});

it('generates, downloads, confirms delivery, and revokes an activation QR', async () => {
  const scope = {
    id: 'scope-1',
    name: 'Annual vote',
    description: null,
    status: 'ACTIVATION_OPEN',
    startsAt: '2035-01-01T12:00:00.000Z',
    endsAt: '2035-01-01T18:00:00.000Z',
    activationStartsAt: '2035-01-01T10:00:00.000Z',
    activationEndsAt: '2035-01-01T17:00:00.000Z',
    credentialExpiresAt: '2035-01-02T00:00:00.000Z',
    votingWeightsEnabled: false,
    issuerKeyVersion: '2035-01',
    version: 1,
  };
  let activeToken: Record<string, unknown> | null = null;
  let generationFails = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.endsWith('/api/v1/admin/me'))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: 'operator-qr',
            email: 'operator-qr@example.com',
            role: 'SYSTEM_ADMIN',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
          },
        }),
      };
    if (path.endsWith('/api/v1/admin/users'))
      return { ok: true, status: 200, json: async () => ({ users: [] }) };
    if (path.endsWith('/api/v1/admin/scopes'))
      return {
        ok: true,
        status: 200,
        json: async () => ({ scopes: [scope] }),
      };
    if (path.includes('/api/v1/admin/registrations?'))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          records: [
            {
              id: 'record-1',
              unitNumber: 'A-1',
              ownerName: 'Owner',
              email: null,
              phone: null,
              votingWeight: '1.0000',
              eligible: true,
              status: 'ACTIVE',
              version: 1,
              scopeEligibilities: [],
              activationTokens: activeToken ? [activeToken] : [],
            },
          ],
        }),
      };
    if (
      path.endsWith(
        '/api/v1/admin/registrations/record-1/scopes/scope-1/activation-token',
      )
    ) {
      if (generationFails)
        return {
          ok: false,
          status: 503,
          json: async () => ({ code: 'GENERATION_FAILED' }),
        };
      activeToken = {
        id: 'token-1',
        votingScopeId: 'scope-1',
        tokenPrefixForSupport: 'abcdefgh',
        status: 'ACTIVE',
        expiresAt: scope.activationEndsAt,
        generatedAt: new Date().toISOString(),
        deliveryMethod: 'PRINT',
        deliveredAt: null,
      };
      return {
        ok: true,
        status: 201,
        json: async () => ({
          activationToken: {
            ...activeToken,
            registrationRecordId: 'record-1',
            rawToken: 'opaque-activation-token',
          },
        }),
      };
    }
    if (path.endsWith('/api/v1/admin/activation-tokens/token-1/delivered')) {
      activeToken = { ...activeToken, deliveredAt: new Date().toISOString() };
      return {
        ok: true,
        status: 200,
        json: async () => ({ activationToken: activeToken }),
      };
    }
    if (path.endsWith('/api/v1/admin/activation-tokens/token-1/revoke')) {
      activeToken = null;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          activationToken: { id: 'token-1', status: 'REVOKED' },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { name: 'Activation tokens' });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Generate activation token' }),
  );
  expect(document.querySelector('select[name="tokenRecordId"]')).toBeDisabled();
  expect(document.querySelector('select[name="tokenScopeId"]')).toBeDisabled();
  const delivery = await screen.findByRole('region', {
    name: 'One-time activation QR',
  });
  expect(screen.getByAltText('Activation token QR code')).toHaveAttribute(
    'src',
    'data:image/png;base64,qr',
  );
  expect(QRCode.toDataURL).toHaveBeenCalledWith(
    'opaque-activation-token',
    expect.objectContaining({ type: 'image/png' }),
  );
  expect(screen.getByText('opaque-activation-token')).toBeInTheDocument();
  expect(
    JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.data),
    ),
  ).not.toContain('opaque-activation-token');
  expect(
    screen.getByRole('link', { name: 'Download QR as PNG' }),
  ).toHaveAttribute('download', 'activation-abcdefgh.png');
  fireEvent.click(
    screen.getByRole('button', { name: 'Download activation PDF' }),
  );
  await waitFor(() =>
    expect(jsPDF).toHaveBeenCalledWith({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    }),
  );
  expect(pdfAddImage).toHaveBeenCalledWith(
    'data:image/png;base64,qr',
    'PNG',
    55,
    51,
    100,
    100,
  );
  expect(pdfText).toHaveBeenCalledWith(['opaque-activation-token'], 20, 173);
  expect(pdfSave).toHaveBeenCalledWith('activation-abcdefgh.pdf');
  expect(delivery).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Confirm secure delivery and hide secret',
    }),
  );
  expect(
    await screen.findByText(
      'Secure delivery confirmed; the raw token has been hidden.',
    ),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByRole('region', { name: 'One-time activation QR' }),
    ).not.toBeInTheDocument(),
  );
  expect(
    await screen.findByRole('heading', { name: 'Current active token' }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Revocation reason'), {
    target: { value: 'Resident requested replacement' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Revoke active token' }));
  expect(
    await screen.findByText('Activation token revoked.'),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/v1/admin/activation-tokens/token-1/revoke'),
    expect.objectContaining({ method: 'POST' }),
  );
  const revokeCalls = fetchMock.mock.calls.filter(([input]) =>
    String(input).endsWith('/api/v1/admin/activation-tokens/token-1/revoke'),
  ).length;
  vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('canvas failed'));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Generate activation token' }),
  );
  expect(
    await screen.findByText(
      'The token was generated, but the QR could not be created. Securely deliver the one-time token below or generate a replacement.',
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'QR unavailable. Use the one-time token below as the secure fallback.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('opaque-activation-token')).toBeInTheDocument();
  expect(
    screen.queryByAltText('Activation token QR code'),
  ).not.toBeInTheDocument();
  expect(
    fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith('/api/v1/admin/activation-tokens/token-1/revoke'),
    ),
  ).toHaveLength(revokeCalls);
  generationFails = true;
  fireEvent.click(screen.getByRole('button', { name: 'Replace active token' }));
  expect(
    await screen.findByText(
      'Activation token action failed: GENERATION_FAILED',
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: 'One-time activation QR' }),
  ).toBeInTheDocument();
  expect(screen.getByText('opaque-activation-token')).toBeInTheDocument();

  generationFails = false;
  fireEvent.click(screen.getByLabelText('Eligible in this scope'));
  fireEvent.click(screen.getByRole('button', { name: 'Save eligibility' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('region', { name: 'One-time activation QR' }),
    ).not.toBeInTheDocument(),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining(
      '/api/v1/admin/registrations/record-1/scopes/scope-1',
    ),
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ eligible: false, votingWeight: '1.0000' }),
    }),
  );

  fireEvent.click(
    await screen.findByRole('button', { name: 'Replace active token' }),
  );
  expect(
    await screen.findByRole('region', { name: 'One-time activation QR' }),
  ).toBeInTheDocument();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('region', { name: 'One-time activation QR' }),
    ).not.toBeInTheDocument(),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/v1/admin/registrations/record-1'),
    expect.objectContaining({ method: 'DELETE' }),
  );
});
