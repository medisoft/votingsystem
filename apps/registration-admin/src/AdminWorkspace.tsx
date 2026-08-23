import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, ApiError, apiUrl } from './api';
import type { MessageKey } from './i18n/messages';
import { useI18n } from './i18n/I18nProvider';
import type {
  ActivationSummaryReport,
  AuditEvent,
  CredentialStatusReport,
  CsvImportPreview,
  CsvImportResult,
  GeneratedActivationToken,
  GeneratedTokenInvalidationTarget,
  IssuerKey,
  Registration,
  RegistrationSummaryReport,
  Role,
  Scope,
  ScopeStatus,
  User,
  WorkspaceView,
} from './types';

const IMPORT_PREVIEW_PAGE_SIZE = 100;
/**
 * Formats an ISO timestamp for a datetime-local input.
 *
 * @param iso - Instant stored by the API.
 * @returns A value accepted by datetime-local inputs in the local timezone.
 */
function datetimeLocalValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
/**
 * Reads voting-scope fields from an administrative form.
 *
 * @param data - Submitted form values, including datetime-local inputs.
 */
function scopeFieldsFromForm(data: FormData) {
  return {
    name: String(data.get('name')),
    description: String(data.get('description')) || null,
    activationStartsAt: new Date(String(data.get('activationStartsAt'))),
    activationEndsAt: new Date(String(data.get('activationEndsAt'))),
    startsAt: new Date(String(data.get('startsAt'))),
    endsAt: new Date(String(data.get('endsAt'))),
    credentialExpiresAt: new Date(String(data.get('credentialExpiresAt'))),
    votingWeightsEnabled: data.get('votingWeightsEnabled') === 'on',
    issuerKeyVersion: String(data.get('issuerKeyVersion')),
  };
}

const nextStatus: Partial<Record<ScopeStatus, ScopeStatus>> = {
  DRAFT: 'REGISTRATION_OPEN',
  REGISTRATION_OPEN: 'ACTIVATION_OPEN',
  ACTIVATION_OPEN: 'VOTING_ACTIVE',
  VOTING_ACTIVE: 'CLOSED',
  CLOSED: 'ARCHIVED',
};
const statusMessage: Record<ScopeStatus, MessageKey> = {
  DRAFT: 'statusDraft',
  REGISTRATION_OPEN: 'statusRegistrationOpen',
  ACTIVATION_OPEN: 'statusActivationOpen',
  VOTING_ACTIVE: 'statusVotingActive',
  CLOSED: 'statusClosed',
  ARCHIVED: 'statusArchived',
};
const roleMessage: Record<Role, MessageKey> = {
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
  SCOPE_COLUMNS_REQUIRE_UPSERT: 'importErrorScopeColumns',
  RECORD_DELETED: 'importErrorRecordDeleted',
  INVALID_SCOPE: 'importErrorInvalidScope',
  SCOPE_ID_REQUIRED: 'importErrorScopeIdRequired',
} as const;
function localizeImportError(
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
  error: { code: string; message: string },
) {
  const key = importErrorMessage[error.code as keyof typeof importErrorMessage];
  return key ? t(key) : error.message;
}

/**
 * Authenticated workspace. The `view` prop selects which section to show.
 *
 * @param user - Signed-in administrator.
 * @param view - Route section to render.
 */
export function AdminWorkspace({
  user,
  view,
}: {
  user: User;
  view: WorkspaceView;
}) {
  const { locale, t } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
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
  const [importMode, setImportMode] = useState<'create' | 'upsert'>('create');
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    otpauthUrl: string;
    qrDataUrl: string | null;
  } | null>(null);
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
  const [registrationStatus, setRegistrationStatus] = useState('');
  const [registrationEligible, setRegistrationEligible] = useState('');
  const [registrationActivation, setRegistrationActivation] = useState('');
  const [editingRecord, setEditingRecord] = useState<Registration | null>(null);
  const [editingScope, setEditingScope] = useState<Scope | null>(null);
  const [auditEventType, setAuditEventType] = useState('');
  const [auditActorId, setAuditActorId] = useState('');
  const [auditTargetType, setAuditTargetType] = useState('');
  const [auditTargetId, setAuditTargetId] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const registrations = useQuery({
    queryKey: [
      'registrations',
      registrationSearch,
      registrationStatus,
      registrationEligible,
      registrationActivation,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (registrationSearch) params.set('search', registrationSearch);
      if (registrationStatus) params.set('status', registrationStatus);
      if (registrationEligible) params.set('eligible', registrationEligible);
      if (registrationActivation)
        params.set('hasActiveToken', registrationActivation);
      const query = params.toString();
      return api<{ records: Registration[] }>(
        `/api/v1/admin/registrations${query ? `?${query}` : ''}`,
      );
    },
  });
  const recentAuditEvents = useQuery({
    queryKey: [
      'audit-events',
      auditEventType,
      auditActorId,
      auditTargetType,
      auditTargetId,
      auditFrom,
      auditTo,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (auditEventType.trim()) params.set('eventType', auditEventType.trim());
      if (auditActorId.trim()) params.set('actorId', auditActorId.trim());
      if (auditTargetType.trim())
        params.set('targetType', auditTargetType.trim());
      if (auditTargetId.trim()) params.set('targetId', auditTargetId.trim());
      if (auditFrom) params.set('from', new Date(auditFrom).toISOString());
      if (auditTo) params.set('to', new Date(auditTo).toISOString());
      const query = params.toString();
      return api<{ events: AuditEvent[] }>(
        `/api/v1/admin/audit-events${query ? `?${query}` : ''}`,
      );
    },
  });
  const issuerKeys = useQuery({
    queryKey: ['issuer-keys'],
    queryFn: () => api<{ keys: IssuerKey[] }>('/api/v1/public/issuer-keys'),
  });
  const auditCsvQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (auditEventType.trim()) params.set('eventType', auditEventType.trim());
    if (auditActorId.trim()) params.set('actorId', auditActorId.trim());
    if (auditTargetType.trim())
      params.set('targetType', auditTargetType.trim());
    if (auditTargetId.trim()) params.set('targetId', auditTargetId.trim());
    if (auditFrom) params.set('from', new Date(auditFrom).toISOString());
    if (auditTo) params.set('to', new Date(auditTo).toISOString());
    const query = params.toString();
    return `/api/v1/admin/audit-events.csv${query ? `?${query}` : ''}`;
  }, [
    auditEventType,
    auditActorId,
    auditTargetType,
    auditTargetId,
    auditFrom,
    auditTo,
  ]);
  const registrationReport = useQuery({
    queryKey: ['report', 'registration-summary'],
    queryFn: () =>
      api<{ report: RegistrationSummaryReport }>(
        '/api/v1/admin/reports/registration-summary',
      ),
  });
  const activationReport = useQuery({
    queryKey: ['report', 'activation-summary'],
    queryFn: () =>
      api<{ report: ActivationSummaryReport }>(
        '/api/v1/admin/reports/activation-summary',
      ),
  });
  const credentialReport = useQuery({
    queryKey: ['report', 'credential-status'],
    queryFn: () =>
      api<{ report: CredentialStatusReport }>(
        '/api/v1/admin/reports/credential-status',
      ),
  });
  const recordHistory = useQuery({
    queryKey: ['audit-events', editingRecord?.id],
    enabled: Boolean(editingRecord),
    queryFn: () =>
      api<{ events: AuditEvent[] }>(
        `/api/v1/admin/audit-events?targetType=RegistrationRecord&targetId=${editingRecord!.id}`,
      ),
  });
  useEffect(() => {
    if (!tokenRecordId && registrations.data?.records[0])
      setTokenRecordId(registrations.data.records[0].id);
    if (!tokenScopeId && scopes.data?.scopes[0])
      setTokenScopeId(scopes.data.scopes[0].id);
  }, [registrations.data, scopes.data, tokenRecordId, tokenScopeId]);
  useEffect(() => {
    if (!params.id || !registrations.data?.records) return;
    const record = registrations.data.records.find(
      (item) => item.id === params.id,
    );
    if (record) setEditingRecord(record);
  }, [params.id, registrations.data]);
  const registrationMutation = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body?: unknown;
      method?: string;
      invalidatesGeneratedToken?: GeneratedTokenInvalidationTarget;
    }) =>
      api(path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    onSuccess: (_result, input) => {
      const target = input.invalidatesGeneratedToken;
      if (
        target &&
        generatedActivationToken?.registrationRecordId ===
          target.registrationRecordId &&
        (!target.votingScopeId ||
          generatedActivationToken.votingScopeId === target.votingScopeId)
      )
        setGeneratedActivationToken(null);
      setEditingRecord(null);
      setMessage(t('recordUpdated'));
      void client.invalidateQueries({ queryKey: ['registrations'] });
      void client.invalidateQueries({ queryKey: ['audit-events'] });
      void client.invalidateQueries({ queryKey: ['report'] });
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
      const qrDataUrl = await QRCode.toDataURL(
        response.activationToken.rawToken,
        {
          errorCorrectionLevel: 'M',
          margin: 4,
          width: 512,
          type: 'image/png',
        },
      ).catch(() => null);
      const activationToken = { ...response.activationToken, qrDataUrl };
      setGeneratedActivationToken(activationToken);
      setMessage(
        activationToken.qrDataUrl
          ? t('activationTokenGenerated')
          : t('activationQrGenerationFailed'),
      );
    },
    onSuccess: () => {
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
      generateActivationTokenMutation.reset();
      setMessage(t('activationTokenDelivered'));
      void client.invalidateQueries({ queryKey: ['registrations'] });
    },
    onError: (error) =>
      setMessage(t('activationTokenActionFailed', { error: error.message })),
  });
  const revokeCredential = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      api('/api/v1/admin/credentials/' + input.id + '/revoke', {
        method: 'POST',
        body: JSON.stringify({ reason: input.reason }),
      }),
    onSuccess: () => {
      setMessage(t('credentialRevoked'));
      void client.invalidateQueries({ queryKey: ['registrations'] });
    },
    onError: (error) =>
      setMessage(t('credentialActionFailed', { error: error.message })),
  });
  const reissueCredential = useMutation({
    mutationFn: async (input: {
      id: string;
      reason: string;
      deliveryMethod: string;
    }) => {
      const response = await api<{
        activationToken: Omit<GeneratedActivationToken, 'qrDataUrl'>;
      }>('/api/v1/admin/credentials/' + input.id + '/reissue', {
        method: 'POST',
        body: JSON.stringify({
          reason: input.reason,
          deliveryMethod: input.deliveryMethod,
        }),
      });
      const qrDataUrl = await QRCode.toDataURL(
        response.activationToken.rawToken,
        {
          errorCorrectionLevel: 'M',
          margin: 4,
          width: 512,
          type: 'image/png',
        },
      ).catch(() => null);
      const activationToken = { ...response.activationToken, qrDataUrl };
      setGeneratedActivationToken(activationToken);
      setMessage(
        activationToken.qrDataUrl
          ? t('credentialReissued')
          : t('activationQrGenerationFailed'),
      );
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['registrations'] });
    },
    onError: (error) =>
      setMessage(t('credentialActionFailed', { error: error.message })),
  });
  const revokeActivationToken = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      api('/api/v1/admin/activation-tokens/' + input.id + '/revoke', {
        method: 'POST',
        body: JSON.stringify({ reason: input.reason }),
      }),
    onSuccess: (_result, input) => {
      if (generatedActivationToken?.id === input.id) {
        setGeneratedActivationToken(null);
        generateActivationTokenMutation.reset();
      }
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
        {
          method: 'POST',
          body: JSON.stringify({ ...source, mode: importMode }),
        },
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
        body: JSON.stringify({ ...source, mode: importMode }),
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
    generateActivationTokenMutation.reset();
    setMessage('');
    generateActivationTokenMutation.mutate({
      registrationRecordId: String(data.get('tokenRecordId')),
      votingScopeId: String(data.get('tokenScopeId')),
      deliveryMethod: String(data.get('deliveryMethod')),
    });
  };
  const downloadActivationPdf = async () => {
    if (!generatedActivationToken?.qrDataUrl) return;
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
      setEditingScope(null);
      setMessage(t('scopeUpdated'));
      void client.invalidateQueries({ queryKey: ['scopes'] });
      void client.invalidateQueries({ queryKey: ['audit-events'] });
      void client.invalidateQueries({ queryKey: ['report'] });
    },
    onError: (error) =>
      setMessage(t('scopeSaveFailed', { error: error.message })),
  });
  const changePassword = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api('/api/v1/admin/auth/password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => setMessage(t('passwordChanged')),
    onError: (error) =>
      setMessage(
        error.message === 'INVALID_CREDENTIALS'
          ? t('invalidCredentials')
          : t('passwordChangeFailed'),
      ),
  });
  const startTotp = useMutation({
    mutationFn: () =>
      api<{ secret: string; otpauthUrl: string }>(
        '/api/v1/admin/auth/totp/setup',
        { method: 'POST' },
      ),
    onSuccess: async (setup) => {
      const qrDataUrl = await QRCode.toDataURL(setup.otpauthUrl, {
        margin: 1,
        width: 192,
      }).catch(() => null);
      setTotpSetup({ ...setup, qrDataUrl });
    },
    onError: () => setMessage(t('totpSetupFailed')),
  });
  const confirmTotp = useMutation({
    mutationFn: (totp: string) =>
      api('/api/v1/admin/auth/totp/confirm', {
        method: 'POST',
        body: JSON.stringify({ totp }),
      }),
    onSuccess: () => {
      setTotpSetup(null);
      setMessage(t('totpEnabledMessage'));
      void client.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error) =>
      setMessage(
        error.message === 'TOTP_INVALID'
          ? t('totpInvalid')
          : t('totpEnableFailed'),
      ),
  });
  const disableTotp = useMutation({
    mutationFn: (body: { password: string; totp?: string }) =>
      api('/api/v1/admin/auth/totp/disable', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setTotpSetup(null);
      setMessage(t('totpDisabledMessage'));
      void client.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error) =>
      setMessage(
        error.message === 'TOTP_INVALID'
          ? t('totpInvalid')
          : error.message === 'INVALID_CREDENTIALS'
            ? t('invalidCredentials')
            : t('totpDisableFailed'),
      ),
  });
  const submitPasswordChange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get('newPassword'));
    if (newPassword !== String(data.get('confirmPassword'))) {
      setMessage(t('passwordMismatch'));
      return;
    }
    changePassword.mutate({
      currentPassword: String(data.get('currentPassword')),
      newPassword,
    });
  };
  const submitTotpConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    confirmTotp.mutate(String(new FormData(event.currentTarget).get('totp')));
  };
  const submitTotpDisable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const totp = String(data.get('totp') ?? '').trim();
    disableTotp.mutate({
      password: String(data.get('password')),
      ...(totp ? { totp } : {}),
    });
  };
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
  const updateUser = useMutation({
    mutationFn: (body: {
      id: string;
      role?: Role;
      status?: 'ACTIVE' | 'INACTIVE';
      unlock?: true;
    }) =>
      api(`/api/v1/admin/users/${body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(body.role ? { role: body.role } : {}),
          ...(body.status ? { status: body.status } : {}),
          ...(body.unlock ? { unlock: true } : {}),
        }),
      }),
    onSuccess: () => {
      setMessage(t('administratorUpdated'));
      void client.invalidateQueries({ queryKey: ['users'] });
      void client.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error) =>
      setMessage(
        error.message === 'LAST_SYSTEM_ADMIN'
          ? t('lastSystemAdmin')
          : t('userUpdateFailed'),
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
      body: scopeFieldsFromForm(data),
    });
  };
  const saveScope = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingScope) return;
    const data = new FormData(event.currentTarget);
    scopeMutation.mutate({
      path: `/api/v1/admin/scopes/${editingScope.id}`,
      method: 'PATCH',
      body: { ...scopeFieldsFromForm(data), version: editingScope.version },
    });
  };
  const rollbackScope = (scope: Scope) => {
    const reason = window.prompt(t('rollbackReasonPrompt'));
    if (!reason || reason.trim().length < 3) return;
    scopeMutation.mutate({
      path: `/api/v1/admin/scopes/${scope.id}/rollback`,
      body: { version: scope.version, reason: reason.trim() },
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
    const registrationRecordId = String(data.get('recordId'));
    const votingScopeId = String(data.get('scopeId'));
    const eligible = data.get('scopeEligible') === 'on';
    registrationMutation.mutate({
      path: `/api/v1/admin/registrations/${registrationRecordId}/scopes/${votingScopeId}`,
      method: 'PUT',
      body: {
        eligible,
        votingWeight: String(data.get('scopeWeight')),
      },
      ...(eligible
        ? {}
        : {
            invalidatesGeneratedToken: { registrationRecordId, votingScopeId },
          }),
    });
  };
  const saveRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRecord) return;
    const data = new FormData(event.currentTarget);
    registrationMutation.mutate({
      path: `/api/v1/admin/registrations/${editingRecord.id}`,
      method: 'PATCH',
      body: {
        unitNumber: String(data.get('unitNumber')),
        ownerName: String(data.get('ownerName')),
        representativeName: String(data.get('representativeName')) || null,
        email: String(data.get('recordEmail')) || null,
        phone: String(data.get('phone')) || null,
        votingWeight: String(data.get('votingWeight')),
        eligible: data.get('eligible') === 'on',
        status: String(data.get('status')),
        notes: String(data.get('notes')) || null,
        version: editingRecord.version,
      },
      ...(data.get('eligible') === 'on'
        ? {}
        : {
            invalidatesGeneratedToken: {
              registrationRecordId: editingRecord.id,
            },
          }),
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
        invalidatesGeneratedToken: { registrationRecordId: record.id },
      });
  };
  const selectedTokenRecord = registrations.data?.records?.find(
    (record) => record.id === tokenRecordId,
  );
  const selectedActiveToken = selectedTokenRecord?.activationTokens?.find(
    (token) => token.votingScopeId === tokenScopeId,
  );
  const selectedCredential = selectedTokenRecord?.issuedCredentials?.find(
    (credential) =>
      credential.votingScopeId === tokenScopeId &&
      !credential.replacedByCredentialId,
  );
  const revokeSelectedCredential = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const credentialId = String(data.get('issuedCredentialId'));
    if (!credentialId) return;
    revokeCredential.mutate({
      id: credentialId,
      reason: String(data.get('revocationReason')),
    });
  };
  const reissueSelectedCredential = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const credentialId = String(data.get('issuedCredentialId'));
    if (!credentialId) return;
    reissueCredential.mutate({
      id: credentialId,
      reason: String(data.get('reissueReason')),
      deliveryMethod: String(data.get('deliveryMethod')),
    });
  };
  const recordCredentialStatus = (record: Registration) => {
    const credentials = record.issuedCredentials ?? [];
    if (credentials.some((credential) => credential.status === 'ACTIVE'))
      return t('credentialStatusIssued');
    if (credentials.length) return t('credentialStatusRevoked');
    return t('credentialStatusNone');
  };
  const importPreviewStart = importPreviewPage * IMPORT_PREVIEW_PAGE_SIZE;
  const importPreviewRows =
    importPreview?.rows.slice(
      importPreviewStart,
      importPreviewStart + IMPORT_PREVIEW_PAGE_SIZE,
    ) ?? [];
  const importPreviewErrors =
    importPreview?.errors.slice(0, IMPORT_PREVIEW_PAGE_SIZE) ?? [];
  const importPreviewPageCount = Math.max(
    1,
    Math.ceil((importPreview?.rows.length ?? 0) / IMPORT_PREVIEW_PAGE_SIZE),
  );
  return (
    <>
      {message && <p role="status">{message}</p>}
      {view === 'home' && (
        <>
          <h1>{t('dashboardTitle')}</h1>
          <h2>{t('operationalReports')}</h2>
          <ul>
            <li>
              {t('eligibleRecords')}:{' '}
              {registrationReport.data?.report?.eligibleRecords ?? '—'}
            </li>
            <li>
              {t('notYetActivated')}:{' '}
              {registrationReport.data?.report?.notYetActivated ?? '—'}
            </li>
            <li>
              {t('tokensGenerated')}:{' '}
              {activationReport.data?.report?.generated ?? '—'}
            </li>
            <li>
              {t('tokensRedeemed')}:{' '}
              {activationReport.data?.report?.redeemed ?? '—'}
            </li>
            <li>
              {t('credentialsIssued')}:{' '}
              {credentialReport.data?.report?.issued ?? '—'}
            </li>
            <li>
              {t('credentialsRevoked')}:{' '}
              {credentialReport.data?.report?.revoked ?? '—'}
            </li>
          </ul>
          {registrationReport.data?.report?.byScope?.length ? (
            <ul>
              {registrationReport.data.report.byScope.map((row) => (
                <li key={row.scopeId}>
                  {row.scopeName}: {row.eligible} / {row.notYetActivated}
                </li>
              ))}
            </ul>
          ) : null}
          <p>
            <a href={`${apiUrl}/api/v1/admin/reports/registration-summary.csv`}>
              {t('downloadRegistrationSummary')}
            </a>
            {' · '}
            <a href={`${apiUrl}/api/v1/admin/reports/activation-summary.csv`}>
              {t('downloadActivationSummary')}
            </a>
            {' · '}
            <a href={`${apiUrl}/api/v1/admin/reports/credential-status.csv`}>
              {t('downloadCredentialStatus')}
            </a>
          </p>
        </>
      )}
      {view === 'account' && (
        <>
          <h1>{t('accountSecurity')}</h1>
          <form onSubmit={submitPasswordChange}>
            <label>
              {t('currentPassword')}
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              {t('newPassword')}
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <label>
              {t('confirmPassword')}
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <button disabled={changePassword.isPending}>
              {t('changePassword')}
            </button>
          </form>
          <p>
            {user.totpEnabled
              ? t('totpEnabledStatus')
              : t('totpDisabledStatus')}
          </p>
          {user.totpEnabled ? (
            <form onSubmit={submitTotpDisable}>
              <label>
                {t('currentPassword')}
                <input name="password" type="password" required />
              </label>
              <label>
                {t('totpCode')}
                <input
                  name="totp"
                  inputMode="numeric"
                  pattern="\d{6}"
                  required
                />
              </label>
              <button disabled={disableTotp.isPending}>
                {t('disableTotp')}
              </button>
            </form>
          ) : totpSetup ? (
            <>
              <p>{t('totpSetupHelp')}</p>
              {totpSetup.qrDataUrl ? (
                <img
                  src={totpSetup.qrDataUrl}
                  alt={t('totpQrAlt')}
                  width={192}
                  height={192}
                />
              ) : null}
              <p>
                {t('totpSecret')}: <code>{totpSetup.secret}</code>
              </p>
              <form onSubmit={submitTotpConfirm}>
                <label>
                  {t('totpCode')}
                  <input
                    name="totp"
                    inputMode="numeric"
                    pattern="\d{6}"
                    required
                  />
                </label>
                <button disabled={confirmTotp.isPending}>
                  {t('confirmTotp')}
                </button>
              </form>
            </>
          ) : (
            <button
              type="button"
              disabled={startTotp.isPending}
              onClick={() => startTotp.mutate()}
            >
              {t('startTotp')}
            </button>
          )}
        </>
      )}
      {view === 'registrations' && (
        <>
          <h1>{t('voterRecords')}</h1>
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
          <label>
            {t('recordStatus')}
            <select
              value={registrationStatus}
              onChange={(event) => setRegistrationStatus(event.target.value)}
            >
              <option value="">{t('filterAll')}</option>
              <option value="ACTIVE">{t('statusActive')}</option>
              <option value="INACTIVE">{t('statusInactive')}</option>
            </select>
          </label>
          <label>
            {t('eligible')}
            <select
              value={registrationEligible}
              onChange={(event) => setRegistrationEligible(event.target.value)}
            >
              <option value="">{t('filterAll')}</option>
              <option value="true">{t('filterEligible')}</option>
              <option value="false">{t('filterIneligible')}</option>
            </select>
          </label>
          {user.role !== 'AUDITOR' && (
            <label>
              {t('activationTokens')}
              <select
                value={registrationActivation}
                onChange={(event) =>
                  setRegistrationActivation(event.target.value)
                }
              >
                <option value="">{t('filterAll')}</option>
                <option value="true">{t('filterActiveToken')}</option>
                <option value="false">{t('filterNoActiveToken')}</option>
              </select>
            </label>
          )}
          <ul>
            {registrations.data?.records?.map((record) => (
              <li key={record.id}>
                <span>
                  <strong>{record.unitNumber ?? t('protectedRecord')}</strong>
                  {record.ownerName ? ` · ${record.ownerName}` : ''}
                  {user.role !== 'AUDITOR' && (
                    <>
                      <br />
                      {record.email ?? t('noEmail')}
                      {' · '}
                      {record.phone ?? t('noPhone')}
                    </>
                  )}
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
                  <br />
                  {t('credentialStatus')}: {recordCredentialStatus(record)}
                  {user.role !== 'AUDITOR' && (
                    <>
                      <br />
                      <button
                        className="small secondary"
                        onClick={() => {
                          setEditingRecord(record);
                          navigate(`/registrations/${record.id}`);
                        }}
                      >
                        {t('editRecord')}
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
          {editingRecord && user.role !== 'AUDITOR' && (
            <>
              <h2>{t('editRecord')}</h2>
              <form key={editingRecord.id} onSubmit={saveRecord}>
                <label>
                  {t('unit')}
                  <input
                    name="unitNumber"
                    defaultValue={editingRecord.unitNumber}
                    required
                  />
                </label>
                <label>
                  {t('owner')}
                  <input
                    name="ownerName"
                    defaultValue={editingRecord.ownerName}
                    required
                  />
                </label>
                <label>
                  {t('representative')}
                  <input
                    name="representativeName"
                    defaultValue={editingRecord.representativeName ?? ''}
                  />
                </label>
                <label>
                  {t('email')}
                  <input
                    name="recordEmail"
                    type="email"
                    defaultValue={editingRecord.email ?? ''}
                  />
                </label>
                <label>
                  {t('phone')}
                  <input
                    name="phone"
                    defaultValue={editingRecord.phone ?? ''}
                  />
                </label>
                <label>
                  {t('votingWeight')}
                  <input
                    name="votingWeight"
                    inputMode="decimal"
                    defaultValue={editingRecord.votingWeight}
                    pattern="\d+(\.\d{1,4})?"
                    required
                  />
                </label>
                <label>
                  {t('recordStatus')}
                  <select name="status" defaultValue={editingRecord.status}>
                    <option value="ACTIVE">{t('statusActive')}</option>
                    <option value="INACTIVE">{t('statusInactive')}</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    name="eligible"
                    type="checkbox"
                    defaultChecked={editingRecord.eligible}
                  />
                  {t('globallyEligible')}
                </label>
                <label>
                  {t('notes')}
                  <input
                    name="notes"
                    defaultValue={editingRecord.notes ?? ''}
                  />
                </label>
                <button disabled={registrationMutation.isPending}>
                  {t('saveRecord')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setEditingRecord(null);
                    navigate('/registrations');
                  }}
                >
                  {t('cancelEdit')}
                </button>
              </form>
              <h3>{t('recordHistory')}</h3>
              <ul>
                {recordHistory.data?.events.length
                  ? recordHistory.data.events.map((event) => (
                      <li key={event.id}>
                        {new Date(event.occurredAt).toLocaleString(locale)} ·{' '}
                        {event.eventType}
                      </li>
                    ))
                  : t('noAuditEvents')}
              </ul>
            </>
          )}
        </>
      )}
      {view === 'registrations' && user.role !== 'AUDITOR' && (
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
        </>
      )}
      {view === 'import' && user.role !== 'AUDITOR' && (
        <>
          <h1>{t('csvImport')}</h1>
          <h2>{t('csvImport')}</h2>
          <p>{t('csvImportHelp')}</p>
          <form onSubmit={(event) => void previewCsv(event)}>
            <label>
              {t('importMode')}
              <select
                value={importMode}
                onChange={(event) => {
                  setImportMode(event.target.value as 'create' | 'upsert');
                  setImportPreview(null);
                  setImportSource(null);
                  setImportResult(null);
                }}
              >
                <option value="create">{t('importModeCreate')}</option>
                <option value="upsert">{t('importModeUpsert')}</option>
              </select>
            </label>
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
                  created: importPreview.summary.created ?? 0,
                  updated: importPreview.summary.updated ?? 0,
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
              {importPreviewErrors.map((error, index) => (
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
              {(importPreview?.errors.length ?? 0) >
                IMPORT_PREVIEW_PAGE_SIZE && (
                <p className="error">
                  {t('importFileErrorsTruncated', {
                    count: IMPORT_PREVIEW_PAGE_SIZE,
                  })}
                </p>
              )}
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
        </>
      )}
      {view === 'registrations' && user.role !== 'AUDITOR' && (
        <>
          <h2>{t('scopeEligibility')}</h2>
          <form onSubmit={setEligibility}>
            <label>
              {t('record')}
              <select name="recordId" required>
                {registrations.data?.records?.map((record) => (
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
                disabled={generateActivationTokenMutation.isPending}
                onChange={(event) => {
                  setTokenRecordId(event.target.value);
                  setGeneratedActivationToken(null);
                  generateActivationTokenMutation.reset();
                }}
                required
              >
                {registrations.data?.records?.map((record) => (
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
                disabled={generateActivationTokenMutation.isPending}
                onChange={(event) => {
                  setTokenScopeId(event.target.value);
                  setGeneratedActivationToken(null);
                  generateActivationTokenMutation.reset();
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
          {selectedCredential && (
            <div className="activation-card">
              <h3>{t('issuedCredential')}</h3>
              <p>
                {t('credentialVersionLabel', {
                  version: selectedCredential.credentialVersion,
                })}
                <br />
                {t('credentialStatus')}:{' '}
                {selectedCredential.status === 'ACTIVE'
                  ? t('credentialStatusIssued')
                  : t('credentialStatusRevoked')}
                <br />
                {t('credentialExpires', {
                  date: new Date(selectedCredential.expiresAt).toLocaleString(
                    locale,
                  ),
                })}
              </p>
              {selectedCredential.status === 'ACTIVE' && (
                <form onSubmit={revokeSelectedCredential}>
                  <input
                    name="issuedCredentialId"
                    type="hidden"
                    value={selectedCredential.id}
                  />
                  <label>
                    {t('revokeReason')}
                    <input name="revocationReason" minLength={3} required />
                  </label>
                  <button
                    className="secondary"
                    disabled={revokeCredential.isPending}
                  >
                    {revokeCredential.isPending
                      ? t('revokingCredential')
                      : t('revokeCredential')}
                  </button>
                </form>
              )}
              <form onSubmit={reissueSelectedCredential}>
                <input
                  name="issuedCredentialId"
                  type="hidden"
                  value={selectedCredential.id}
                />
                <label>
                  {t('reissueReason')}
                  <input name="reissueReason" minLength={3} required />
                </label>
                <label>
                  {t('deliveryMethod')}
                  <select name="deliveryMethod" defaultValue="PRINT" required>
                    <option value="PRINT">{t('deliveryPrint')}</option>
                    <option value="SECURE_EMAIL">{t('deliveryEmail')}</option>
                    <option value="MANUAL">{t('deliveryManual')}</option>
                  </select>
                </label>
                <button disabled={reissueCredential.isPending}>
                  {reissueCredential.isPending
                    ? t('reissuingCredential')
                    : t('reissueCredential')}
                </button>
              </form>
            </div>
          )}
          {selectedActiveToken && (
            <div className="activation-card">
              <h3>{t('activeActivationToken')}</h3>
              <p>
                {t('activationTokenPrefix', {
                  prefix: selectedActiveToken.tokenPrefixForSupport,
                })}
                <br />
                {t('activationTokenExpires', {
                  date: new Date(selectedActiveToken.expiresAt).toLocaleString(
                    locale,
                  ),
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
              {generatedActivationToken.qrDataUrl ? (
                <img
                  className="activation-qr"
                  src={generatedActivationToken.qrDataUrl}
                  alt={t('activationQrAlt')}
                />
              ) : (
                <p className="error">{t('activationQrFallback')}</p>
              )}
              <p>{t('activationInstructions')}</p>
              <label>
                {t('rawActivationToken')}
                <code className="activation-secret">
                  {generatedActivationToken.rawToken}
                </code>
              </label>
              {generatedActivationToken.qrDataUrl && (
                <>
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
                </>
              )}
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
      {view === 'scopes' && (
        <>
          <h1>{t('votingScopes')}</h1>
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
                          onClick={() => setEditingScope(scope)}
                        >
                          {t('editScope')}
                        </button>
                      </>
                    )}
                  {user.role === 'SYSTEM_ADMIN' &&
                    scope.status === 'CLOSED' && (
                      <>
                        <br />
                        <button
                          className="small secondary"
                          onClick={() => rollbackScope(scope)}
                        >
                          {t('rollbackToVoting')}
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
          {user.role === 'SYSTEM_ADMIN' && editingScope && (
            <>
              <h2>{t('editScope')}</h2>
              <form key={editingScope.id} onSubmit={saveScope}>
                <label>
                  {t('name')}
                  <input
                    name="name"
                    defaultValue={editingScope.name}
                    required
                  />
                </label>
                <label>
                  {t('description')}
                  <input
                    name="description"
                    defaultValue={editingScope.description ?? ''}
                  />
                </label>
                <label>
                  {t('activationStart')}
                  <input
                    name="activationStartsAt"
                    type="datetime-local"
                    defaultValue={datetimeLocalValue(
                      editingScope.activationStartsAt,
                    )}
                    required
                  />
                </label>
                <label>
                  {t('activationEnd')}
                  <input
                    name="activationEndsAt"
                    type="datetime-local"
                    defaultValue={datetimeLocalValue(
                      editingScope.activationEndsAt,
                    )}
                    required
                  />
                </label>
                <label>
                  {t('votingStart')}
                  <input
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={datetimeLocalValue(editingScope.startsAt)}
                    required
                  />
                </label>
                <label>
                  {t('votingEnd')}
                  <input
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={datetimeLocalValue(editingScope.endsAt)}
                    required
                  />
                </label>
                <label>
                  {t('credentialExpiration')}
                  <input
                    name="credentialExpiresAt"
                    type="datetime-local"
                    defaultValue={datetimeLocalValue(
                      editingScope.credentialExpiresAt,
                    )}
                    required
                  />
                </label>
                <label>
                  {t('issuerKeyVersion')}
                  <input
                    name="issuerKeyVersion"
                    defaultValue={editingScope.issuerKeyVersion}
                    required
                  />
                </label>
                <label className="check">
                  <input
                    name="votingWeightsEnabled"
                    type="checkbox"
                    defaultChecked={editingScope.votingWeightsEnabled}
                  />
                  {t('weightedVoting')}
                </label>
                <button disabled={scopeMutation.isPending}>
                  {t('saveScope')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditingScope(null)}
                >
                  {t('cancelEdit')}
                </button>
              </form>
            </>
          )}
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
                  <input
                    name="activationEndsAt"
                    type="datetime-local"
                    required
                  />
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
        </>
      )}
      {view === 'administrators' &&
        (user.role === 'SYSTEM_ADMIN' ? (
          <>
            <h1>{t('administrators')}</h1>
            <h2>{t('administrators')}</h2>
            <ul>
              {users.data?.users.map((item) => (
                <li key={item.id}>
                  <span>{item.email}</span>
                  <span>
                    {t(roleMessage[item.role])} · {item.status}
                  </span>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      setMessage('');
                      updateUser.mutate({
                        id: item.id,
                        role: String(
                          new FormData(event.currentTarget).get('role'),
                        ) as Role,
                      });
                    }}
                  >
                    <label>
                      {t('role')}
                      <select name="role" defaultValue={item.role}>
                        <option value="REGISTRATION_OPERATOR">
                          {t('roleRegistrationOperator')}
                        </option>
                        <option value="AUDITOR">{t('roleAuditor')}</option>
                        <option value="SYSTEM_ADMIN">
                          {t('roleSystemAdmin')}
                        </option>
                      </select>
                    </label>
                    <button disabled={updateUser.isPending}>
                      {t('saveRole')}
                    </button>
                  </form>
                  <button
                    type="button"
                    className="secondary"
                    disabled={updateUser.isPending}
                    onClick={() => {
                      setMessage('');
                      updateUser.mutate({
                        id: item.id,
                        status:
                          item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                      });
                    }}
                  >
                    {item.status === 'ACTIVE'
                      ? t('deactivateUser')
                      : t('reactivateUser')}
                  </button>
                  {item.lockedUntil &&
                    new Date(item.lockedUntil) > new Date() && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={updateUser.isPending}
                        onClick={() => {
                          setMessage('');
                          updateUser.mutate({ id: item.id, unlock: true });
                        }}
                      >
                        {t('unlockUser')}
                      </button>
                    )}
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
        ))}
      {view === 'home' && (
        <>
          <h2>{t('issuerKeys')}</h2>
          <ul>
            {issuerKeys.data?.keys?.length
              ? issuerKeys.data.keys.map((key) => (
                  <li key={key.keyVersion}>
                    {t('issuerKeyVersion')}: {key.keyVersion}
                    <br />
                    {t('issuerAlgorithm')}: {key.algorithm}
                    <br />
                    {t('issuerProtocol')}: {key.protocol}
                    <br />
                    {t('issuerModulus')}: {key.modulusLength}
                    <br />
                    {key.issuer}
                  </li>
                ))
              : t('noIssuerKeys')}
          </ul>
        </>
      )}
      {view === 'audit' && (
        <>
          <h1>{t('auditEvents')}</h1>
          <h2>{t('auditEvents')}</h2>
          <label>
            {t('auditEventType')}
            <input
              value={auditEventType}
              onChange={(event) => setAuditEventType(event.target.value)}
            />
          </label>
          <label>
            {t('auditActorId')}
            <input
              value={auditActorId}
              onChange={(event) => setAuditActorId(event.target.value)}
            />
          </label>
          <label>
            {t('auditTargetType')}
            <input
              value={auditTargetType}
              onChange={(event) => setAuditTargetType(event.target.value)}
            />
          </label>
          <label>
            {t('auditTargetId')}
            <input
              value={auditTargetId}
              onChange={(event) => setAuditTargetId(event.target.value)}
            />
          </label>
          <label>
            {t('auditFrom')}
            <input
              type="datetime-local"
              value={auditFrom}
              onChange={(event) => setAuditFrom(event.target.value)}
            />
          </label>
          <label>
            {t('auditTo')}
            <input
              type="datetime-local"
              value={auditTo}
              onChange={(event) => setAuditTo(event.target.value)}
            />
          </label>
          <p>
            <a href={`${apiUrl}${auditCsvQuery}`}>{t('downloadAuditEvents')}</a>
          </p>
          <ul>
            {recentAuditEvents.data?.events?.length
              ? recentAuditEvents.data.events.map((event) => (
                  <li key={event.id}>
                    {new Date(event.occurredAt).toLocaleString(locale)} ·{' '}
                    {event.eventType}
                    {event.actorId ? ` · ${event.actorId}` : ''}
                    {event.targetType ? ` · ${event.targetType}` : ''}
                    {event.targetId ? ` · ${event.targetId}` : ''}
                  </li>
                ))
              : t('noAuditEvents')}
          </ul>
        </>
      )}
    </>
  );
}
