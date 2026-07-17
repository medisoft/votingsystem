import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { createTranslator, detectLocale } from './i18n';

// Empty by default so browsers use the same hostname that served the UI.
// Vite proxies /api to the registration API during local/container development.
const apiUrl = import.meta.env.VITE_API_URL || '';
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
    throw new Error(
      (
        (await response.json().catch(() => ({ code: 'REQUEST_FAILED' }))) as {
          code?: string;
        }
      ).code ?? 'REQUEST_FAILED',
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
  const previewImport = useMutation({
    mutationFn: (source: { fileName: string; csv: string }) =>
      api<{ preview: CsvImportPreview }>(
        '/api/v1/admin/registrations/import/preview',
        { method: 'POST', body: JSON.stringify(source) },
      ),
    onSuccess: ({ preview }, source) => {
      setImportSource(source);
      setImportPreview(preview);
      setImportResult(null);
    },
    onError: () => setMessage(t('importPreviewFailed')),
  });
  const commitImport = useMutation({
    mutationFn: (source: { fileName: string; csv: string }) =>
      api<CsvImportResult>('/api/v1/admin/registrations/import', {
        method: 'POST',
        body: JSON.stringify(source),
      }),
    onSuccess: (result) => {
      setImportResult(result);
      setMessage(t('importCommitted'));
      void client.invalidateQueries({ queryKey: ['registrations'] });
    },
    onError: (error) =>
      setMessage(
        error.message === 'IMPORT_ALREADY_COMMITTED'
          ? t('importAlreadyCommitted')
          : t('importCommitFailed'),
      ),
  });
  const previewCsv = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const file = new FormData(event.currentTarget).get('csvFile');
    if (!(file instanceof File) || !file.name) return;
    setImportSource(null);
    setImportPreview(null);
    setImportResult(null);
    const source = { fileName: file.name, csv: await file.text() };
    previewImport.mutate(source);
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
                {importPreview.rows.slice(0, 100).map((row) => (
                  <p key={'preview-' + row.row}>
                    {row.data
                      ? t('importPreviewValidRow', {
                          row: row.row,
                          unit: row.data.unitNumber,
                          owner: row.data.ownerName,
                        })
                      : t('importPreviewRejectedRow', { row: row.row })}
                  </p>
                ))}
                {[
                  ...importPreview.errors,
                  ...importPreview.rows.flatMap((row) => row.errors),
                ]
                  .slice(0, 100)
                  .map((error, index) => (
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
              {message && <p role="status">{message}</p>}
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
