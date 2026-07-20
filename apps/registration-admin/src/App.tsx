import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createTranslator, detectLocale } from './i18n';

// Empty by default so browsers use the same hostname that served the UI.
// Vite proxies /api to the registration API during local/container development.
const apiUrl = import.meta.env.VITE_API_URL || '';
const IMPORT_PREVIEW_PAGE_SIZE = 100;
type Role = 'SYSTEM_ADMIN' | 'REGISTRATION_OPERATOR' | 'AUDITOR';
interface User {
  id: string;
  email: string;
  role: Role;
  status: string;
  createdAt: string;
}
type ScopeStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'ACTIVATION_OPEN'
  | 'VOTING_ACTIVE'
  | 'CLOSED'
  | 'ARCHIVED';
interface Scope {
  id: string;
  name: string;
  description: string | null;
  status: ScopeStatus;
  startsAt: string;
  endsAt: string;
  activationStartsAt: string;
  activationEndsAt: string;
  credentialExpiresAt: string;
  votingWeightsEnabled: boolean;
  issuerKeyVersion: string;
  version: number;
}
interface Registration {
  id: string;
  unitNumber?: string;
  ownerName?: string;
  representativeName?: string | null;
  email?: string | null;
  phone?: string | null;
  votingWeight: string;
  eligible: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  scopeEligibilities: Array<{
    eligible: boolean;
    votingWeight: string;
    votingScope: { id: string; name: string; status: ScopeStatus };
  }>;
  activationTokens: ActivationTokenSummary[];
}
interface ActivationTokenSummary {
  id: string;
  votingScopeId: string;
  tokenPrefixForSupport: string;
  status: 'ACTIVE';
  expiresAt: string;
  generatedAt: string;
  deliveryMethod: string | null;
  deliveredAt: string | null;
}
interface GeneratedActivationToken extends ActivationTokenSummary {
  registrationRecordId: string;
  rawToken: string;
  qrDataUrl: string;
}
interface CsvImportPreview {
  fileHash: string;
  summary: { total: number; valid: number; rejected: number };
  errors: Array<{ row: number; field: string; code: string; message: string }>;
  rows: Array<{
    row: number;
    data?: { unitNumber: string; ownerName: string };
    errors: Array<{
      row: number;
      field: string;
      code: string;
      message: string;
    }>;
  }>;
}
interface CsvImportResult {
  import: {
    id: string;
    totalRows: number;
    importedRows: number;
    rejectedRows: number;
  };
  errorReportUrl: string | null;
}
interface ApiErrorBody {
  code?: string;
  preview?: CsvImportPreview;
}
class ApiError extends Error {
  constructor(readonly body: ApiErrorBody) {
    super(body.code ?? 'REQUEST_FAILED');
  }
}
const nextStatus: Partial<Record<ScopeStatus, ScopeStatus>> = {
  DRAFT: 'REGISTRATION_OPEN',
  REGISTRATION_OPEN: 'ACTIVATION_OPEN',
  ACTIVATION_OPEN: 'VOTING_ACTIVE',
  VOTING_ACTIVE: 'CLOSED',
  CLOSED: 'ARCHIVED',
};

function useI18n() {
  const locale = useMemo(() => detectLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t('pageTitle');
  }, [locale, t]);
  return { locale, t };
}

type Translator = ReturnType<typeof createTranslator>;
const statusMessage: Record<ScopeStatus, Parameters<Translator>[0]> = {
  DRAFT: 'statusDraft',
  REGISTRATION_OPEN: 'statusRegistrationOpen',
  ACTIVATION_OPEN: 'statusActivationOpen',
  VOTING_ACTIVE: 'statusVotingActive',
  CLOSED: 'statusClosed',
  ARCHIVED: 'statusArchived',
};
const roleMessage: Record<Role, Parameters<Translator>[0]> = {
  SYSTEM_ADMIN: 'roleSystemAdmin',
  REGISTRATION_OPERATOR: 'roleRegistrationOperator',
  AUDITOR: 'roleAuditor',
};
const importErrorMessage = {
  FILE_TOO_LARGE: 'importErrorFileTooLarge',
  INVALID_CSV: 'importErrorInvalidCsv',
  EMPTY_FILE: 'importErrorEmptyFile',
  MISSING_HEADER: 'importErrorMissingHeader',
  EMPTY_HEADER: 'importErrorEmptyHeader',
  UNKNOWN_HEADER: 'importErrorUnknownHeader',
  DUPLICATE_HEADER: 'importErrorDuplicateHeader',
  TOO_MANY_ROWS: 'importErrorTooManyRows',
  COLUMN_COUNT: 'importErrorColumnCount',
  INVALID_FIELD: 'importErrorInvalidField',
  DUPLICATE_IN_FILE: 'importErrorDuplicateInFile',
  DUPLICATE_EXISTING: 'importErrorDuplicateExisting',
} as const;
function localizeImportError(
  t: Translator,
  error: { code: string; message: string },
) {
  const key = importErrorMessage[error.code as keyof typeof importErrorMessage];
  return key ? t(key) : error.message;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
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

function Login() {
  const { t } = useI18n();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const login = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api('/api/v1/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['me'] }),
    onError: (value) =>
      setError(
        value.message === 'INVALID_CREDENTIALS'
          ? t('invalidCredentials')
          : t('loginFailed'),
      ),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    login.mutate({
      email: String(data.get('email')),
      password: String(data.get('password')),
    });
  };
  return (
    <main>
      <section>
        <p className="eyebrow">{t('admin')}</p>
        <h1>{t('loginTitle')}</h1>
        <form onSubmit={submit}>
          <label>
            {t('email')}
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            {t('password')}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={login.isPending}>
            {login.isPending ? t('signingIn') : t('signIn')}
          </button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ user }: { user: User }) {
  const { locale, t } = useI18n();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const [tokenRecordId, setTokenRecordId] = useState('');
  const [tokenScopeId, setTokenScopeId] = useState('');
  const [generatedActivationToken, setGeneratedActivationToken] =
    useState<GeneratedActivationToken | null>(null);
  const [importSource, setImportSource] = useState<{
    fileName: string;
    csv: string;
  } | null>(null);
  const [importPreview, setImportPreview] = useState<CsvImportPreview | null>(
    null,
  );
  const [importResult, setImportResult] = useState<CsvImportResult | null>(
    null,
  );
  const [importPreviewPage, setImportPreviewPage] = useState(0);
  const importSelection = useRef(0);
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: User[] }>('/api/v1/admin/users'),
    enabled: user.role === 'SYSTEM_ADMIN',
  });
  const scopes = useQuery({
    queryKey: ['scopes'],
    queryFn: () => api<{ scopes: Scope[] }>('/api/v1/admin/scopes'),
  });
  const [registrationSearch, setRegistrationSearch] = useState('');
  const registrations = useQuery({
    queryKey: ['registrations', registrationSearch],
    queryFn: () =>
      api<{ records: Registration[] }>(
        `/api/v1/admin/registrations?search=${encodeURIComponent(registrationSearch)}`,
      ),
  });
  useEffect(() => {
    if (!tokenRecordId && registrations.data?.records[0])
      setTokenRecordId(registrations.data.records[0].id);
    if (!tokenScopeId && scopes.data?.scopes[0])
      setTokenScopeId(scopes.data.scopes[0].id);
  }, [registrations.data, scopes.data, tokenRecordId, tokenScopeId]);
  const registrationMutation = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) =>
      api(path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    onSuccess: () => {
      setMessage(t('recordUpdated'));
      void client.invalidateQueries({ queryKey: ['registrations'] });
    },
    onError: (error) =>
      setMessage(t('recordSaveFailed', { error: error.message })),
  });
  const generateActivationTokenMutation = useMutation({
    mutationFn: async (input: {
      registrationRecordId: string;
      votingScopeId: string;
      deliveryMethod: string;
    }) => {
      const response = await api<{
        activationToken: Omit<GeneratedActivationToken, 'qrDataUrl'>;
      }>(
        '/api/v1/admin/registrations/' +
          input.registrationRecordId +
          '/scopes/' +
          input.votingScopeId +
          '/activation-token',
        {
          method: 'POST',
          body: JSON.stringify({ deliveryMethod: input.deliveryMethod }),
        },
      );
      try {
        const qrDataUrl = await QRCode.toDataURL(
          response.activationToken.rawToken,
          {
            errorCorrectionLevel: 'M',
            margin: 4,
            width: 512,
            type: 'image/png',
          },
        );
        return { ...response.activationToken, qrDataUrl };
      } catch (error) {
        await api(
          '/api/v1/admin/activation-tokens/' +
            response.activationToken.id +
            '/revoke',
          {
            method: 'POST',
            body: JSON.stringify({ reason: 'QR generation failed' }),
          },
        );
        throw error;
      }
    },
    onSuccess: (activationToken) => {
      setGeneratedActivationToken(activationToken);
      setMessage(t('activationTokenGenerated'));
      void client.invalidateQueries({ queryKey: ['registrations'] });
    },
    onError: (error) =>
      setMessage(t('activationTokenActionFailed', { error: error.message })),
  });
  const confirmActivationTokenDelivery = useMutation({
    mutationFn: (input: { id: string; deliveryMethod: string }) =>
      api('/api/v1/admin/activation-tokens/' + input.id + '/delivered', {
        method: 'POST',
        body: JSON.stringify({ deliveryMethod: input.deliveryMethod }),
      }),
    onSuccess: () => {
      setGeneratedActivationToken(null);
      setMessage(t('activationTokenDelivered'));
      void client.invalidateQueries({ queryKey: ['registrations'] });
    },
    onError: (error) =>
      setMessage(t('activationTokenActionFailed', { error: error.message })),
  });
  const revokeActivationToken = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      api('/api/v1/admin/activation-tokens/' + input.id + '/revoke', {
        method: 'POST',
        body: JSON.stringify({ reason: input.reason }),
      }),
    onSuccess: (_result, input) => {
      if (generatedActivationToken?.id === input.id)
        setGeneratedActivationToken(null);
      setMessage(t('activationTokenRevoked'));
      void client.invalidateQueries({ queryKey: ['registrations'] });
    },
    onError: (error) =>
      setMessage(t('activationTokenActionFailed', { error: error.message })),
  });
  const previewImport = useMutation({
    mutationFn: ({
      source,
    }: {
      source: { fileName: string; csv: string };
      selection: number;
    }) =>
      api<{ preview: CsvImportPreview }>(
        '/api/v1/admin/registrations/import/preview',
        { method: 'POST', body: JSON.stringify(source) },
      ),
    onSuccess: ({ preview }, { source, selection }) => {
      if (selection !== importSelection.current) return;
      setImportSource(source);
      setImportPreview(preview);
      setImportPreviewPage(0);
      setImportResult(null);
    },
    onError: (_error, { selection }) => {
      if (selection === importSelection.current)
        setMessage(t('importPreviewFailed'));
    },
  });
  const commitImport = useMutation({
    mutationFn: (source: { fileName: string; csv: string }) =>
      api<CsvImportResult>('/api/v1/admin/registrations/import', {
        method: 'POST',
        body: JSON.stringify(source),
      }),
    onSuccess: (result) => {
      setImportSource(null);
      setImportResult(result);
      setMessage(t('importCommitted'));
      void client.invalidateQueries({ queryKey: ['registrations'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.body.preview) {
        setImportPreview(error.body.preview);
        setImportPreviewPage(0);
        setImportResult(null);
      }
      setMessage(
        error.message === 'IMPORT_ALREADY_COMMITTED'
          ? t('importAlreadyCommitted')
          : t('importCommitFailed'),
      );
    },
  });
  const previewCsv = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const file = new FormData(event.currentTarget).get('csvFile');
    if (!(file instanceof File) || !file.name) return;
    setImportSource(null);
    setImportPreview(null);
    setImportPreviewPage(0);
    setImportResult(null);
    const selection = importSelection.current;
    const source = { fileName: file.name, csv: await file.text() };
    if (selection !== importSelection.current) return;
    previewImport.mutate({ source, selection });
  };
  const generateActivation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setGeneratedActivationToken(null);
    setMessage('');
    generateActivationTokenMutation.mutate({
      registrationRecordId: String(data.get('tokenRecordId')),
      votingScopeId: String(data.get('tokenScopeId')),
      deliveryMethod: String(data.get('deliveryMethod')),
    });
  };
  const downloadActivationPdf = async () => {
    if (!generatedActivationToken) return;
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.text(t('oneTimeActivationTitle'), 20, 22);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.text(pdf.splitTextToSize(t('activationInstructions'), 170), 20, 34);
      pdf.addImage(generatedActivationToken.qrDataUrl, 'PNG', 55, 51, 100, 100);
      pdf.setFont('helvetica', 'bold');
      pdf.text(t('rawActivationToken'), 20, 166);
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(9);
      pdf.text(
        pdf.splitTextToSize(generatedActivationToken.rawToken, 170),
        20,
        173,
      );
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.text(
        t('activationTokenPrefix', {
          prefix: generatedActivationToken.tokenPrefixForSupport,
        }),
        20,
        191,
      );
      pdf.setTextColor(160, 30, 30);
      pdf.text(
        pdf.splitTextToSize(t('oneTimeActivationWarning'), 170),
        20,
        205,
      );
      pdf.save(
        'activation-' + generatedActivationToken.tokenPrefixForSupport + '.pdf',
      );
    } catch {
      setMessage(t('activationPdfFailed'));
    }
  };
  const revokeSelectedActivationToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const tokenId = String(data.get('activationTokenId'));
    if (!tokenId) return;
    revokeActivationToken.mutate({
      id: tokenId,
      reason: String(data.get('revocationReason')),
    });
  };
  const scopeMutation = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body: unknown;
      method?: string;
    }) => api(path, { method, body: JSON.stringify(body) }),
    onSuccess: () => {
      setMessage(t('scopeUpdated'));
      void client.invalidateQueries({ queryKey: ['scopes'] });
    },
    onError: (error) =>
      setMessage(t('scopeSaveFailed', { error: error.message })),
  });
  const logout = useMutation({
    mutationFn: () => api('/api/v1/admin/auth/logout', { method: 'POST' }),
    onSuccess: () => client.setQueryData(['me'], null),
  });
  const create = useMutation({
    mutationFn: (body: { email: string; password: string; role: Role }) =>
      api('/api/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setMessage(t('administratorCreated'));
      void client.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) =>
      setMessage(
        error.message === 'EMAIL_EXISTS'
          ? t('emailExists')
          : t('userCreateFailed'),
      ),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const data = new FormData(event.currentTarget);
    create.mutate({
      email: String(data.get('email')),
      password: String(data.get('password')),
      role: String(data.get('role')) as Role,
    });
    event.currentTarget.reset();
  };
  const createScope = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const data = new FormData(event.currentTarget);
    scopeMutation.mutate({
      path: '/api/v1/admin/scopes',
      body: {
        name: String(data.get('name')),
        description: String(data.get('description')) || null,
        activationStartsAt: new Date(
          String(data.get('activationStartsAt')),
        ).toISOString(),
        activationEndsAt: new Date(
          String(data.get('activationEndsAt')),
        ).toISOString(),
        startsAt: new Date(String(data.get('startsAt'))).toISOString(),
        endsAt: new Date(String(data.get('endsAt'))).toISOString(),
        credentialExpiresAt: new Date(
          String(data.get('credentialExpiresAt')),
        ).toISOString(),
        votingWeightsEnabled: data.get('votingWeightsEnabled') === 'on',
        issuerKeyVersion: String(data.get('issuerKeyVersion')),
      },
    });
  };
  const renameScope = (scope: Scope) => {
    const name = window.prompt(t('newScopeName'), scope.name);
    if (name && name.trim() !== scope.name)
      scopeMutation.mutate({
        path: `/api/v1/admin/scopes/${scope.id}`,
        method: 'PATCH',
        body: { name: name.trim(), version: scope.version },
      });
  };
  const createRegistration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    registrationMutation.mutate({
      path: '/api/v1/admin/registrations',
      body: {
        unitNumber: String(data.get('unitNumber')),
        ownerName: String(data.get('ownerName')),
        representativeName: String(data.get('representativeName')) || null,
        email: String(data.get('recordEmail')) || null,
        phone: String(data.get('phone')) || null,
        votingWeight: String(data.get('votingWeight')),
        eligible: true,
        status: 'ACTIVE',
        notes: String(data.get('notes')) || null,
      },
    });
  };
  const setEligibility = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    registrationMutation.mutate({
      path: `/api/v1/admin/registrations/${data.get('recordId')}/scopes/${data.get('scopeId')}`,
      method: 'PUT',
      body: {
        eligible: data.get('scopeEligible') === 'on',
        votingWeight: String(data.get('scopeWeight')),
      },
    });
  };
  const editRegistration = (record: Registration) => {
    const ownerName = window.prompt(t('ownerNamePrompt'), record.ownerName);
    if (ownerName && ownerName.trim() !== record.ownerName)
      registrationMutation.mutate({
        path: `/api/v1/admin/registrations/${record.id}`,
        method: 'PATCH',
        body: { ownerName: ownerName.trim(), version: record.version },
      });
  };
  const deleteRegistration = (record: Registration) => {
    if (
      window.confirm(t('deactivateConfirm', { unit: record.unitNumber ?? '' }))
    )
      registrationMutation.mutate({
        path: `/api/v1/admin/registrations/${record.id}`,
        method: 'DELETE',
        body: { version: record.version },
      });
  };
  const selectedTokenRecord = registrations.data?.records.find(
    (record) => record.id === tokenRecordId,
  );
  const selectedActiveToken = selectedTokenRecord?.activationTokens?.find(
    (token) => token.votingScopeId === tokenScopeId,
  );
  const importPreviewStart = importPreviewPage * IMPORT_PREVIEW_PAGE_SIZE;
  const importPreviewRows =
    importPreview?.rows.slice(
      importPreviewStart,
      importPreviewStart + IMPORT_PREVIEW_PAGE_SIZE,
    ) ?? [];
  const importPreviewPageCount = Math.max(
    1,
    Math.ceil((importPreview?.rows.length ?? 0) / IMPORT_PREVIEW_PAGE_SIZE),
  );
  return (
    <main>
      <section className="wide">
        <header>
          <div>
            <p className="eyebrow">{t('admin')}</p>
            <h1>{t('dashboardTitle')}</h1>
            <p>
              {user.email} · {t(roleMessage[user.role])}
            </p>
          </div>
          <button className="secondary" onClick={() => logout.mutate()}>
            {t('signOut')}
          </button>
        </header>
        {message && <p role="status">{message}</p>}
        <h2>{t('voterRecords')}</h2>
        {user.role === 'AUDITOR' ? (
          <p>{t('auditorNotice')}</p>
        ) : (
          <label>
            {t('searchRecords')}
            <input
              value={registrationSearch}
              onChange={(event) => setRegistrationSearch(event.target.value)}
              placeholder={t('searchPlaceholder')}
            />
          </label>
        )}
        <ul>
          {registrations.data?.records.map((record) => (
            <li key={record.id}>
              <span>
                <strong>{record.unitNumber ?? t('protectedRecord')}</strong>
                {record.ownerName ? ` · ${record.ownerName}` : ''}
                <br />
                {record.email ?? t('noEmail')}
                {' · '}
                {record.phone ?? t('noPhone')}
              </span>
              <span>
                {record.eligible ? t('eligible') : t('notEligible')} ·{' '}
                {t('weight')} {record.votingWeight}
                <br />
                {record.scopeEligibilities
                  .map(
                    (item) =>
                      `${item.votingScope.name}: ${item.eligible ? t('yes') : t('no')} (${item.votingWeight})`,
                  )
                  .join(', ') || t('noScopeEligibility')}
                {user.role !== 'AUDITOR' && (
                  <>
                    <br />
                    <button
                      className="small secondary"
                      onClick={() => editRegistration(record)}
                    >
                      {t('editOwner')}
                    </button>
                  </>
                )}
                {user.role === 'SYSTEM_ADMIN' && (
                  <>
                    <br />
                    <button
                      className="small secondary"
                      onClick={() => deleteRegistration(record)}
                    >
                      {t('deactivate')}
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {user.role !== 'AUDITOR' && (
          <>
            <h2>{t('createRecord')}</h2>
            <form onSubmit={createRegistration}>
              <label>
                {t('unit')}
                <input name="unitNumber" required />
              </label>
              <label>
                {t('owner')}
                <input name="ownerName" required />
              </label>
              <label>
                {t('representative')}
                <input name="representativeName" />
              </label>
              <label>
                {t('email')}
                <input name="recordEmail" type="email" />
              </label>
              <label>
                {t('phone')}
                <input name="phone" />
              </label>
              <label>
                {t('votingWeight')}
                <input
                  name="votingWeight"
                  inputMode="decimal"
                  defaultValue="1.0000"
                  pattern="\d+(\.\d{1,4})?"
                  required
                />
              </label>
              <label>
                {t('notes')}
                <input name="notes" />
              </label>
              <button disabled={registrationMutation.isPending}>
                {t('createRecord')}
              </button>
            </form>
            <h2>{t('csvImport')}</h2>
            <p>{t('csvImportHelp')}</p>
            <form onSubmit={(event) => void previewCsv(event)}>
              <label>
                {t('csvFile')}
                <input
                  name="csvFile"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  onChange={() => {
                    importSelection.current += 1;
                    setImportSource(null);
                    setImportPreview(null);
                    setImportPreviewPage(0);
                    setImportResult(null);
                  }}
                />
              </label>
              <button disabled={previewImport.isPending}>
                {previewImport.isPending
                  ? t('previewingImport')
                  : t('previewImport')}
              </button>
            </form>
            {importPreview && (
              <div>
                <p role="status">
                  {t('importSummary', {
                    total: importPreview.summary.total,
                    valid: importPreview.summary.valid,
                    rejected: importPreview.summary.rejected,
                  })}
                </p>
                {importPreview.rows.length > 0 && (
                  <p>
                    {t('importPreviewRange', {
                      from: importPreviewStart + 1,
                      to: Math.min(
                        importPreviewStart + IMPORT_PREVIEW_PAGE_SIZE,
                        importPreview.rows.length,
                      ),
                      total: importPreview.rows.length,
                    })}
                  </p>
                )}
                {importPreview.errors.map((error, index) => (
                  <p
                    className="error"
                    key={'file-' + error.row + '-' + error.field + '-' + index}
                  >
                    {t('importRowError', {
                      row: error.row,
                      field: error.field,
                      message: localizeImportError(t, error),
                    })}
                  </p>
                ))}
                {importPreviewRows.map((row) => (
                  <div key={'preview-' + row.row}>
                    <p>
                      {row.data
                        ? t('importPreviewValidRow', {
                            row: row.row,
                            unit: row.data.unitNumber,
                            owner: row.data.ownerName,
                          })
                        : t('importPreviewRejectedRow', { row: row.row })}
                    </p>
                    {row.errors.map((error, index) => (
                      <p
                        className="error"
                        key={error.row + '-' + error.field + '-' + index}
                      >
                        {t('importRowError', {
                          row: error.row,
                          field: error.field,
                          message: localizeImportError(t, error),
                        })}
                      </p>
                    ))}
                  </div>
                ))}
                {importPreviewPageCount > 1 && (
                  <div>
                    <button
                      type="button"
                      disabled={importPreviewPage === 0}
                      onClick={() =>
                        setImportPreviewPage((page) => Math.max(0, page - 1))
                      }
                    >
                      {t('previousImportPreviewPage')}
                    </button>
                    <button
                      type="button"
                      disabled={importPreviewPage >= importPreviewPageCount - 1}
                      onClick={() =>
                        setImportPreviewPage((page) =>
                          Math.min(importPreviewPageCount - 1, page + 1),
                        )
                      }
                    >
                      {t('nextImportPreviewPage')}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  disabled={
                    !importSource ||
                    !importPreview.summary.valid ||
                    commitImport.isPending
                  }
                  onClick={() =>
                    importSource && commitImport.mutate(importSource)
                  }
                >
                  {commitImport.isPending
                    ? t('committingImport')
                    : t('commitImport')}
                </button>
              </div>
            )}
            {importResult && (
              <p role="status">
                {t('importResult', {
                  imported: importResult.import.importedRows,
                  rejected: importResult.import.rejectedRows,
                })}{' '}
                {importResult.errorReportUrl && (
                  <a href={apiUrl + importResult.errorReportUrl}>
                    {t('downloadErrorReport')}
                  </a>
                )}
              </p>
            )}
            <h2>{t('scopeEligibility')}</h2>
            <form onSubmit={setEligibility}>
              <label>
                {t('record')}
                <select name="recordId" required>
                  {registrations.data?.records.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.unitNumber} — {record.ownerName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('scope')}
                <select name="scopeId" required>
                  {scopes.data?.scopes.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('scopeWeight')}
                <input
                  name="scopeWeight"
                  inputMode="decimal"
                  defaultValue="1.0000"
                  required
                />
              </label>
              <label className="check">
                <input name="scopeEligible" type="checkbox" defaultChecked />
                {t('eligibleInScope')}
              </label>
              <button disabled={registrationMutation.isPending}>
                {t('saveEligibility')}
              </button>
            </form>
            <h2>{t('activationTokens')}</h2>
            <p>{t('activationTokenHelp')}</p>
            <form onSubmit={generateActivation}>
              <label>
                {t('record')}
                <select
                  name="tokenRecordId"
                  value={tokenRecordId}
                  onChange={(event) => {
                    setTokenRecordId(event.target.value);
                    setGeneratedActivationToken(null);
                  }}
                  required
                >
                  {registrations.data?.records.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.unitNumber} — {record.ownerName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('scope')}
                <select
                  name="tokenScopeId"
                  value={tokenScopeId}
                  onChange={(event) => {
                    setTokenScopeId(event.target.value);
                    setGeneratedActivationToken(null);
                  }}
                  required
                >
                  {scopes.data?.scopes.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('deliveryMethod')}
                <select name="deliveryMethod" defaultValue="PRINT" required>
                  <option value="PRINT">{t('deliveryPrint')}</option>
                  <option value="SECURE_EMAIL">{t('deliveryEmail')}</option>
                  <option value="MANUAL">{t('deliveryManual')}</option>
                </select>
              </label>
              <button disabled={generateActivationTokenMutation.isPending}>
                {generateActivationTokenMutation.isPending
                  ? t('generatingActivationToken')
                  : selectedActiveToken
                    ? t('generateReplacementToken')
                    : t('generateActivationToken')}
              </button>
            </form>
            {selectedActiveToken && (
              <div className="activation-card">
                <h3>{t('activeActivationToken')}</h3>
                <p>
                  {t('activationTokenPrefix', {
                    prefix: selectedActiveToken.tokenPrefixForSupport,
                  })}
                  <br />
                  {t('activationTokenExpires', {
                    date: new Date(
                      selectedActiveToken.expiresAt,
                    ).toLocaleString(locale),
                  })}
                  <br />
                  {selectedActiveToken.deliveredAt
                    ? t('activationTokenDeliveredStatus', {
                        date: new Date(
                          selectedActiveToken.deliveredAt,
                        ).toLocaleString(locale),
                      })
                    : t('activationTokenNotDelivered')}
                </p>
                <form onSubmit={revokeSelectedActivationToken}>
                  <input
                    name="activationTokenId"
                    type="hidden"
                    value={selectedActiveToken.id}
                  />
                  <label>
                    {t('revokeReason')}
                    <input name="revocationReason" minLength={3} required />
                  </label>
                  <button
                    className="secondary"
                    disabled={revokeActivationToken.isPending}
                  >
                    {revokeActivationToken.isPending
                      ? t('revokingActivationToken')
                      : t('revokeActivationToken')}
                  </button>
                </form>
              </div>
            )}
            {generatedActivationToken && (
              <div
                className="activation-card one-time-delivery"
                role="region"
                aria-label={t('oneTimeActivationTitle')}
              >
                <h3>{t('oneTimeActivationTitle')}</h3>
                <p className="error">{t('oneTimeActivationWarning')}</p>
                <img
                  className="activation-qr"
                  src={generatedActivationToken.qrDataUrl}
                  alt={t('activationQrAlt')}
                />
                <p>{t('activationInstructions')}</p>
                <label>
                  {t('rawActivationToken')}
                  <code className="activation-secret">
                    {generatedActivationToken.rawToken}
                  </code>
                </label>
                <a
                  className="download-link"
                  href={generatedActivationToken.qrDataUrl}
                  download={
                    'activation-' +
                    generatedActivationToken.tokenPrefixForSupport +
                    '.png'
                  }
                >
                  {t('downloadActivationQr')}
                </a>
                <button
                  type="button"
                  className="secondary"
                  onClick={downloadActivationPdf}
                >
                  {t('downloadActivationPdf')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => window.print()}
                >
                  {t('printActivationQr')}
                </button>
                <button
                  type="button"
                  disabled={confirmActivationTokenDelivery.isPending}
                  onClick={() =>
                    confirmActivationTokenDelivery.mutate({
                      id: generatedActivationToken.id,
                      deliveryMethod:
                        generatedActivationToken.deliveryMethod ?? 'MANUAL',
                    })
                  }
                >
                  {confirmActivationTokenDelivery.isPending
                    ? t('confirmingSecureDelivery')
                    : t('confirmSecureDelivery')}
                </button>
              </div>
            )}
          </>
        )}
        <h2>{t('votingScopes')}</h2>
        {scopes.isError && <p role="alert">{t('scopesLoadFailed')}</p>}
        <ul>
          {scopes.data?.scopes.map((scope) => (
            <li key={scope.id}>
              <span>
                <strong>{scope.name}</strong>
                <br />
                {new Date(scope.startsAt).toLocaleString(locale)} —{' '}
                {new Date(scope.endsAt).toLocaleString(locale)}
              </span>
              <span>
                {t(statusMessage[scope.status])} · v{scope.version}
                {user.role === 'SYSTEM_ADMIN' &&
                  (scope.status === 'DRAFT' ||
                    scope.status === 'REGISTRATION_OPEN') && (
                    <>
                      <br />
                      <button
                        className="small secondary"
                        onClick={() => renameScope(scope)}
                      >
                        {t('editName')}
                      </button>
                    </>
                  )}
                {user.role === 'SYSTEM_ADMIN' && nextStatus[scope.status] && (
                  <>
                    <br />
                    <button
                      className="small"
                      onClick={() =>
                        scopeMutation.mutate({
                          path: `/api/v1/admin/scopes/${scope.id}/transition`,
                          body: {
                            status: nextStatus[scope.status],
                            version: scope.version,
                          },
                        })
                      }
                    >
                      {t('advanceTo', {
                        status: t(statusMessage[nextStatus[scope.status]!]),
                      })}
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {user.role === 'SYSTEM_ADMIN' && (
          <>
            <h2>{t('createScope')}</h2>
            <form onSubmit={createScope}>
              <label>
                {t('name')}
                <input name="name" required />
              </label>
              <label>
                {t('description')}
                <input name="description" />
              </label>
              <label>
                {t('activationStart')}
                <small>{t('activationStartHelp')}</small>
                <input
                  name="activationStartsAt"
                  type="datetime-local"
                  required
                />
              </label>
              <label>
                {t('activationEnd')}
                <small>{t('activationEndHelp')}</small>
                <input name="activationEndsAt" type="datetime-local" required />
              </label>
              <label>
                {t('votingStart')}
                <small>{t('votingStartHelp')}</small>
                <input name="startsAt" type="datetime-local" required />
              </label>
              <label>
                {t('votingEnd')}
                <small>{t('votingEndHelp')}</small>
                <input name="endsAt" type="datetime-local" required />
              </label>
              <label>
                {t('credentialExpiration')}
                <small>{t('credentialExpirationHelp')}</small>
                <input
                  name="credentialExpiresAt"
                  type="datetime-local"
                  required
                />
              </label>
              <label>
                {t('issuerKeyVersion')}
                <input
                  name="issuerKeyVersion"
                  defaultValue="2026-01"
                  required
                />
              </label>
              <label className="check">
                <input name="votingWeightsEnabled" type="checkbox" />
                {t('weightedVoting')}
              </label>
              <small>{t('weightedVotingHelp')}</small>
              <button disabled={scopeMutation.isPending}>
                {t('createScope')}
              </button>
            </form>
          </>
        )}
        {user.role === 'SYSTEM_ADMIN' ? (
          <>
            <h2>{t('administrators')}</h2>
            <ul>
              {users.data?.users.map((item) => (
                <li key={item.id}>
                  <span>{item.email}</span>
                  <span>
                    {t(roleMessage[item.role])} · {item.status}
                  </span>
                </li>
              ))}
            </ul>
            <h2>{t('createAdministrator')}</h2>
            <form onSubmit={submit}>
              <label>
                {t('email')}
                <input name="email" type="email" required />
              </label>
              <label>
                {t('temporaryPassword')}
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  required
                />
              </label>
              <label>
                {t('role')}
                <select name="role">
                  <option value="REGISTRATION_OPERATOR">
                    {t('roleRegistrationOperator')}
                  </option>
                  <option value="AUDITOR">{t('roleAuditor')}</option>
                  <option value="SYSTEM_ADMIN">{t('roleSystemAdmin')}</option>
                </select>
              </label>
              <button disabled={create.isPending}>{t('createUser')}</button>
            </form>
          </>
        ) : (
          <p>{t('restrictedRoleNotice')}</p>
        )}
      </section>
    </main>
  );
}

export function App() {
  const { t } = useI18n();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: User }>('/api/v1/admin/me'),
    retry: false,
  });
  if (me.isPending)
    return (
      <main>
        <p>{t('checkingSession')}</p>
      </main>
    );
  return me.data ? <Dashboard user={me.data.user} /> : <Login />;
}
