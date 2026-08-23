import { Prisma, type PrismaClient } from '@prisma/client';

export const REPORT_KINDS = [
  'registration-summary',
  'activation-summary',
  'credential-status',
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export interface ScopeCountRow {
  scopeId: string;
  scopeName: string;
}

export interface RegistrationSummaryReport {
  generatedAt: string;
  totalRecords: number;
  eligibleRecords: number;
  ineligibleRecords: number;
  activeRecords: number;
  inactiveRecords: number;
  notYetActivated: number;
  byScope: Array<
    ScopeCountRow & {
      eligible: number;
      ineligible: number;
      notYetActivated: number;
    }
  >;
}

export interface ActivationSummaryReport {
  generatedAt: string;
  generated: number;
  active: number;
  redeemed: number;
  expired: number;
  revoked: number;
  byScope: Array<
    ScopeCountRow & {
      generated: number;
      active: number;
      redeemed: number;
      expired: number;
      revoked: number;
    }
  >;
}

export interface CredentialStatusReport {
  generatedAt: string;
  issued: number;
  active: number;
  revoked: number;
  expired: number;
  replaced: number;
  byScope: Array<
    ScopeCountRow & {
      issued: number;
      active: number;
      revoked: number;
      expired: number;
      replaced: number;
    }
  >;
}

type ReportDb = PrismaClient | Prisma.TransactionClient;

interface ScopeEligibilityCount {
  scopeId: string;
  scopeName: string;
  eligible: bigint;
  ineligible: bigint;
  notYetActivated: bigint;
}

interface TokenCountRow {
  scopeId: string | null;
  scopeName: string | null;
  generated: bigint;
  active: bigint;
  redeemed: bigint;
  expired: bigint;
  revoked: bigint;
}

interface CredentialCountRow {
  scopeId: string | null;
  scopeName: string | null;
  issued: bigint;
  active: bigint;
  revoked: bigint;
  expired: bigint;
  replaced: bigint;
}

/**
 * Quotes a CSV cell using RFC 4180 double-quote escaping.
 *
 * @param value - Cell text or number included in an operational report.
 * @returns A quoted CSV field that does not interpret commas or quotes.
 */
export function csvField(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

/**
 * Serializes report rows with a stable header order.
 *
 * @param headers - Column names written as the first line.
 * @param rows - Values aligned to headers, sorted by the caller.
 * @returns UTF-8 CSV text with LF line endings.
 */
export function rowsToCsv(
  headers: string[],
  rows: Array<Array<string | number>>,
): string {
  return [
    headers.map(csvField).join(','),
    ...rows.map((row) => row.map(csvField).join(',')),
  ].join('\n');
}

function toCount(value: bigint | number | null | undefined): number {
  return Number(value ?? 0);
}

/**
 * Aggregates registration eligibility counts without personal fields.
 *
 * @param prisma - Database client used for the snapshot.
 * @param asOf - Instant recorded as generatedAt; counts ignore this clock.
 * @returns Overall and per-scope registration totals.
 */
export async function registrationSummary(
  prisma: ReportDb,
  asOf: Date,
): Promise<RegistrationSummaryReport> {
  const [totals, neverActivated, byScope] = await Promise.all([
    prisma.registrationRecord.groupBy({
      by: ['eligible', 'status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.registrationRecord.count({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        eligible: true,
        issuedCredentials: { none: {} },
      },
    }),
    prisma.$queryRaw<ScopeEligibilityCount[]>(Prisma.sql`
      SELECT
        s.id AS "scopeId",
        s.name AS "scopeName",
        COUNT(*) FILTER (
          WHERE r."deletedAt" IS NULL
            AND r.status = 'ACTIVE'
            AND COALESCE(e.eligible, r.eligible)
        ) AS eligible,
        COUNT(*) FILTER (
          WHERE r."deletedAt" IS NULL
            AND NOT COALESCE(e.eligible, r.eligible)
        ) AS ineligible,
        COUNT(*) FILTER (
          WHERE r."deletedAt" IS NULL
            AND r.status = 'ACTIVE'
            AND COALESCE(e.eligible, r.eligible)
            AND NOT EXISTS (
              SELECT 1
              FROM "IssuedCredential" c
              WHERE c."votingScopeId" = s.id
                AND c."registrationRecordId" = r.id
            )
        ) AS "notYetActivated"
      FROM "VotingScope" s
      CROSS JOIN "RegistrationRecord" r
      LEFT JOIN "ScopeEligibility" e
        ON e."votingScopeId" = s.id
       AND e."registrationRecordId" = r.id
      GROUP BY s.id, s.name
      ORDER BY s.name ASC, s.id ASC
    `),
  ]);
  let totalRecords = 0;
  let eligibleRecords = 0;
  let ineligibleRecords = 0;
  let activeRecords = 0;
  let inactiveRecords = 0;
  for (const row of totals) {
    totalRecords += row._count._all;
    if (row.eligible) eligibleRecords += row._count._all;
    else ineligibleRecords += row._count._all;
    if (row.status === 'ACTIVE') activeRecords += row._count._all;
    else inactiveRecords += row._count._all;
  }
  return {
    generatedAt: asOf.toISOString(),
    totalRecords,
    eligibleRecords,
    ineligibleRecords,
    activeRecords,
    inactiveRecords,
    notYetActivated: neverActivated,
    byScope: byScope.map((row) => ({
      scopeId: row.scopeId,
      scopeName: row.scopeName,
      eligible: toCount(row.eligible),
      ineligible: toCount(row.ineligible),
      notYetActivated: toCount(row.notYetActivated),
    })),
  };
}

/**
 * Aggregates activation-token lifecycle counts without token secrets.
 *
 * @param prisma - Database client used for the snapshot.
 * @param asOf - Instant used to treat still-ACTIVE past-due tokens as expired.
 * @returns Overall and per-scope token totals.
 */
export async function activationSummary(
  prisma: ReportDb,
  asOf: Date,
): Promise<ActivationSummaryReport> {
  const rows = await prisma.$queryRaw<TokenCountRow[]>(Prisma.sql`
    SELECT
      s.id AS "scopeId",
      s.name AS "scopeName",
      COUNT(t.id) AS generated,
      COUNT(t.id) FILTER (
        WHERE t.status = 'ACTIVE' AND t."expiresAt" > ${asOf}
      ) AS active,
      COUNT(t.id) FILTER (WHERE t.status = 'REDEEMED') AS redeemed,
      COUNT(t.id) FILTER (
        WHERE t.status = 'EXPIRED'
           OR (t.status = 'ACTIVE' AND t."expiresAt" <= ${asOf})
      ) AS expired,
      COUNT(t.id) FILTER (WHERE t.status = 'REVOKED') AS revoked
    FROM "VotingScope" s
    LEFT JOIN "ActivationToken" t ON t."votingScopeId" = s.id
    GROUP BY s.id, s.name
    ORDER BY s.name ASC, s.id ASC
  `);
  const totals = rows.reduce(
    (acc, row) => ({
      generated: acc.generated + toCount(row.generated),
      active: acc.active + toCount(row.active),
      redeemed: acc.redeemed + toCount(row.redeemed),
      expired: acc.expired + toCount(row.expired),
      revoked: acc.revoked + toCount(row.revoked),
    }),
    { generated: 0, active: 0, redeemed: 0, expired: 0, revoked: 0 },
  );
  return {
    generatedAt: asOf.toISOString(),
    ...totals,
    byScope: rows.map((row) => ({
      scopeId: row.scopeId ?? '',
      scopeName: row.scopeName ?? '',
      generated: toCount(row.generated),
      active: toCount(row.active),
      redeemed: toCount(row.redeemed),
      expired: toCount(row.expired),
      revoked: toCount(row.revoked),
    })),
  };
}

/**
 * Aggregates issued-credential status counts without public keys or identity.
 *
 * @param prisma - Database client used for the snapshot.
 * @param asOf - Instant used to treat still-ACTIVE past-due credentials as expired.
 * @returns Overall and per-scope credential totals.
 */
export async function credentialStatusReport(
  prisma: ReportDb,
  asOf: Date,
): Promise<CredentialStatusReport> {
  const rows = await prisma.$queryRaw<CredentialCountRow[]>(Prisma.sql`
    SELECT
      s.id AS "scopeId",
      s.name AS "scopeName",
      COUNT(c.id) AS issued,
      COUNT(c.id) FILTER (
        WHERE c.status = 'ACTIVE' AND c."expiresAt" > ${asOf}
      ) AS active,
      COUNT(c.id) FILTER (WHERE c.status = 'REVOKED') AS revoked,
      COUNT(c.id) FILTER (
        WHERE c.status = 'ACTIVE' AND c."expiresAt" <= ${asOf}
      ) AS expired,
      COUNT(c.id) FILTER (
        WHERE c."replacedByCredentialId" IS NOT NULL
      ) AS replaced
    FROM "VotingScope" s
    LEFT JOIN "IssuedCredential" c ON c."votingScopeId" = s.id
    GROUP BY s.id, s.name
    ORDER BY s.name ASC, s.id ASC
  `);
  const totals = rows.reduce(
    (acc, row) => ({
      issued: acc.issued + toCount(row.issued),
      active: acc.active + toCount(row.active),
      revoked: acc.revoked + toCount(row.revoked),
      expired: acc.expired + toCount(row.expired),
      replaced: acc.replaced + toCount(row.replaced),
    }),
    { issued: 0, active: 0, revoked: 0, expired: 0, replaced: 0 },
  );
  return {
    generatedAt: asOf.toISOString(),
    ...totals,
    byScope: rows.map((row) => ({
      scopeId: row.scopeId ?? '',
      scopeName: row.scopeName ?? '',
      issued: toCount(row.issued),
      active: toCount(row.active),
      revoked: toCount(row.revoked),
      expired: toCount(row.expired),
      replaced: toCount(row.replaced),
    })),
  };
}

/**
 * Renders a registration-summary snapshot as deterministic CSV.
 *
 * @param report - JSON registration summary.
 * @returns CSV with a GLOBAL totals row followed by scopes ordered by name.
 */
export function registrationSummaryCsv(
  report: RegistrationSummaryReport,
): string {
  return rowsToCsv(
    [
      'generated_at',
      'scope_id',
      'scope_name',
      'total_records',
      'eligible_records',
      'ineligible_records',
      'active_records',
      'inactive_records',
      'not_yet_activated',
    ],
    [
      [
        report.generatedAt,
        '',
        'GLOBAL',
        report.totalRecords,
        report.eligibleRecords,
        report.ineligibleRecords,
        report.activeRecords,
        report.inactiveRecords,
        report.notYetActivated,
      ],
      ...report.byScope.map((row) => [
        report.generatedAt,
        row.scopeId,
        row.scopeName,
        '',
        row.eligible,
        row.ineligible,
        '',
        '',
        row.notYetActivated,
      ]),
    ],
  );
}

/**
 * Renders an activation-summary snapshot as deterministic CSV.
 *
 * @param report - JSON activation summary.
 * @returns CSV with a GLOBAL totals row followed by scopes ordered by name.
 */
export function activationSummaryCsv(report: ActivationSummaryReport): string {
  return rowsToCsv(
    [
      'generated_at',
      'scope_id',
      'scope_name',
      'generated',
      'active',
      'redeemed',
      'expired',
      'revoked',
    ],
    [
      [
        report.generatedAt,
        '',
        'GLOBAL',
        report.generated,
        report.active,
        report.redeemed,
        report.expired,
        report.revoked,
      ],
      ...report.byScope.map((row) => [
        report.generatedAt,
        row.scopeId,
        row.scopeName,
        row.generated,
        row.active,
        row.redeemed,
        row.expired,
        row.revoked,
      ]),
    ],
  );
}

/**
 * Renders a credential-status snapshot as deterministic CSV.
 *
 * @param report - JSON credential status report.
 * @returns CSV with a GLOBAL totals row followed by scopes ordered by name.
 */
export function credentialStatusCsv(report: CredentialStatusReport): string {
  return rowsToCsv(
    [
      'generated_at',
      'scope_id',
      'scope_name',
      'issued',
      'active',
      'revoked',
      'expired',
      'replaced',
    ],
    [
      [
        report.generatedAt,
        '',
        'GLOBAL',
        report.issued,
        report.active,
        report.revoked,
        report.expired,
        report.replaced,
      ],
      ...report.byScope.map((row) => [
        report.generatedAt,
        row.scopeId,
        row.scopeName,
        row.issued,
        row.active,
        row.revoked,
        row.expired,
        row.replaced,
      ]),
    ],
  );
}
