export type Role = 'SYSTEM_ADMIN' | 'REGISTRATION_OPERATOR' | 'AUDITOR';

export interface User {
  id: string;
  email: string;
  role: Role;
  status: string;
  totpEnabled: boolean;
  lockedUntil: string | null;
  createdAt: string;
}

export type ScopeStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'ACTIVATION_OPEN'
  | 'VOTING_ACTIVE'
  | 'CLOSED'
  | 'ARCHIVED';

export interface Scope {
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

export interface IssuedCredentialSummary {
  id: string;
  votingScopeId: string;
  status: 'ACTIVE' | 'REVOKED';
  credentialVersion: number;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason?: string | null;
  replacedByCredentialId: string | null;
}

export interface ActivationTokenSummary {
  id: string;
  votingScopeId: string;
  tokenPrefixForSupport: string;
  status: 'ACTIVE';
  expiresAt: string;
  generatedAt: string;
  deliveryMethod: string | null;
  deliveredAt: string | null;
}

export interface Registration {
  id: string;
  unitNumber?: string;
  ownerName?: string;
  representativeName?: string | null;
  email?: string | null;
  phone?: string | null;
  votingWeight: string;
  eligible: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string | null;
  version: number;
  scopeEligibilities: Array<{
    eligible: boolean;
    votingWeight: string;
    votingScope: { id: string; name: string; status: ScopeStatus };
  }>;
  activationTokens: ActivationTokenSummary[];
  issuedCredentials?: IssuedCredentialSummary[];
}

export interface GeneratedActivationToken extends ActivationTokenSummary {
  registrationRecordId: string;
  rawToken: string;
  qrDataUrl: string | null;
}

export interface GeneratedTokenInvalidationTarget {
  registrationRecordId: string;
  votingScopeId?: string;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  eventType: string;
  actorType: string;
  actorId: string | null;
  targetType: string;
  targetId: string | null;
}

export interface IssuerKey {
  keyVersion: string;
  algorithm: string;
  protocol: string;
  modulusLength: number;
  issuer: string;
}

export interface CsvImportPreview {
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

export interface CsvImportResult {
  import: {
    id: string;
    totalRows: number;
    importedRows: number;
    rejectedRows: number;
  };
  errorReportUrl: string | null;
}

export interface RegistrationSummaryReport {
  generatedAt: string;
  totalRecords: number;
  eligibleRecords: number;
  ineligibleRecords: number;
  activeRecords: number;
  inactiveRecords: number;
  notYetActivated: number;
  byScope: Array<{
    scopeId: string;
    scopeName: string;
    eligible: number;
    ineligible: number;
    notYetActivated: number;
  }>;
}

export interface ActivationSummaryReport {
  generatedAt: string;
  generated: number;
  active: number;
  redeemed: number;
  expired: number;
  revoked: number;
}

export interface CredentialStatusReport {
  generatedAt: string;
  issued: number;
  active: number;
  revoked: number;
  expired: number;
  replaced: number;
}

export interface ApiErrorBody {
  code?: string;
  preview?: CsvImportPreview;
}

export type WorkspaceView =
  | 'home'
  | 'account'
  | 'registrations'
  | 'import'
  | 'scopes'
  | 'audit'
  | 'administrators';
