import { ActorType, Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from './audit.js';
import {
  MAX_IMPORT_JSON_BYTES,
  canonicalUnitNumber,
  errorsToCsv,
  type ImportError,
  type ImportMode,
  type ImportRow,
  parseRegistrationCsv,
} from './csv-import.js';

const importBody = z.object({
  fileName: z.string().trim().min(1).max(255),
  csv: z.string(),
  mode: z.enum(['create', 'upsert']).default('create'),
});
const idParams = z.object({ id: z.string().uuid() });
type ImportDb = PrismaClient | Prisma.TransactionClient;
export const REGISTRATION_WRITE_LOCK = 2026071705;
export const IMPORT_TRANSACTION_TIMEOUT_MS = 60_000;

/**
 * Classifies CSV rows against existing units for create or upsert.
 *
 * @param db - Prisma client or open transaction.
 * @param csv - Original CSV text.
 * @param mode - create rejects existing units; upsert updates them.
 */
async function previewImport(db: ImportDb, csv: string, mode: ImportMode) {
  const parsed = parseRegistrationCsv(csv, { mode });
  if (parsed.errors.length)
    return {
      fileHash: parsed.fileHash,
      rows: parsed.rows,
      errors: parsed.errors,
      summary: { total: 0, valid: 0, created: 0, updated: 0, rejected: 0 },
    };
  const unitKeys = parsed.rows.flatMap((row) =>
    row.data ? [canonicalUnitNumber(row.data.unitNumber)] : [],
  );
  const existingRecords = unitKeys.length
    ? await db.$queryRaw<Array<{ unitNumber: string; deletedAt: Date | null }>>(
        Prisma.sql`SELECT "unitNumber", "deletedAt" FROM "RegistrationRecord" WHERE "unitNumber" IN (${Prisma.join(unitKeys)})`,
      )
    : [];
  const existing = new Map(
    existingRecords.map((record) => [
      canonicalUnitNumber(record.unitNumber),
      record,
    ]),
  );
  const scopeIds = [
    ...new Set(
      parsed.rows.flatMap((row) =>
        row.data?.votingScopeId ? [row.data.votingScopeId] : [],
      ),
    ),
  ];
  const knownScopes = new Set(
    scopeIds.length
      ? (
          await db.votingScope.findMany({
            where: { id: { in: scopeIds } },
            select: { id: true },
          })
        ).map((scope) => scope.id)
      : [],
  );
  const rows: ImportRow[] = parsed.rows.map((row) => {
    if (!row.data) return row;
    if (row.data.votingScopeId && !knownScopes.has(row.data.votingScopeId))
      return {
        row: row.row,
        errors: [
          {
            row: row.row,
            field: 'voting_scope_id',
            code: 'INVALID_SCOPE',
            message: 'Voting scope does not exist.',
          },
        ],
      };
    const match = existing.get(canonicalUnitNumber(row.data.unitNumber));
    if (!match) return { ...row, action: 'create' as const };
    if (mode === 'create')
      return {
        row: row.row,
        errors: [
          {
            row: row.row,
            field: 'unit_number',
            code: 'DUPLICATE_EXISTING',
            message: 'Unit identifier already exists.',
          },
        ],
      };
    if (match.deletedAt && !row.data.statusProvided)
      return {
        row: row.row,
        errors: [
          {
            row: row.row,
            field: 'status',
            code: 'RECORD_DELETED',
            message:
              'Soft-deleted units are updated only when status is set to ACTIVE.',
          },
        ],
      };
    return { ...row, action: 'update' as const };
  });
  const created = rows.filter((row) => row.action === 'create').length;
  const updated = rows.filter((row) => row.action === 'update').length;
  const valid = created + updated;
  return {
    fileHash: parsed.fileHash,
    rows,
    errors: [] as ImportError[],
    summary: {
      total: rows.length,
      valid,
      created,
      updated,
      rejected: rows.length - valid,
    },
  };
}

/**
 * Maps a valid CSV row to RegistrationRecord write fields.
 *
 * @param row - Parsed registration fields from preview.
 */
function registrationWriteData(row: NonNullable<ImportRow['data']>) {
  return {
    unitNumber: row.unitNumber,
    ownerName: row.ownerName,
    representativeName: row.representativeName,
    email: row.email,
    phone: row.phone,
    votingWeight: new Prisma.Decimal(row.votingWeight),
    eligible: row.eligible,
    status: row.status,
    notes: row.notes,
  };
}

export function registerImportRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/admin/registrations/import/preview',
    {
      preHandler: app.requireRegistrationWrite,
      bodyLimit: MAX_IMPORT_JSON_BYTES,
    },
    async (request, reply) => {
      const body = importBody.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ code: 'INVALID_IMPORT_REQUEST' });
      const preview = await previewImport(
        app.prisma,
        body.data.csv,
        body.data.mode,
      );
      return { preview };
    },
  );

  app.post(
    '/api/v1/admin/registrations/import',
    {
      preHandler: app.requireRegistrationWrite,
      bodyLimit: MAX_IMPORT_JSON_BYTES,
    },
    async (request, reply) => {
      const body = importBody.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ code: 'INVALID_IMPORT_REQUEST' });
      const result = await app.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_WRITE_LOCK})`,
          );
          const mode = body.data.mode;
          const fileHash = parseRegistrationCsv(body.data.csv, {
            mode,
          }).fileHash;
          const previous = await tx.registrationImport.findUnique({
            where: { fileHash },
          });
          if (previous && mode === 'create') return { previous } as const;
          if (previous && mode === 'upsert')
            return { previous, idempotent: true } as const;
          const preview = await previewImport(tx, body.data.csv, mode);
          if (preview.errors.length || preview.summary.valid === 0)
            return { invalid: preview } as const;
          const createdRows = preview.rows.filter(
            (row) => row.action === 'create' && row.data,
          );
          const updatedRows = preview.rows.filter(
            (row) => row.action === 'update' && row.data,
          );
          if (createdRows.length)
            await tx.registrationRecord.createMany({
              data: createdRows.map((row) => registrationWriteData(row.data!)),
            });
          for (const row of updatedRows) {
            const data = row.data!;
            await tx.registrationRecord.update({
              where: { unitNumber: data.unitNumber },
              data: {
                ...registrationWriteData(data),
                ...(data.statusProvided && data.status === 'ACTIVE'
                  ? { deletedAt: null }
                  : {}),
              },
            });
          }
          const scopeRows = preview.rows.filter(
            (row) => row.data?.votingScopeId,
          );
          if (scopeRows.length) {
            const units = scopeRows.map((row) => row.data!.unitNumber);
            const records = await tx.registrationRecord.findMany({
              where: { unitNumber: { in: units } },
              select: { id: true, unitNumber: true },
            });
            const ids = new Map(
              records.map((record) => [record.unitNumber, record.id]),
            );
            for (const row of scopeRows) {
              const data = row.data!;
              const registrationRecordId = ids.get(data.unitNumber)!;
              await tx.scopeEligibility.upsert({
                where: {
                  registrationRecordId_votingScopeId: {
                    registrationRecordId,
                    votingScopeId: data.votingScopeId!,
                  },
                },
                create: {
                  registrationRecordId,
                  votingScopeId: data.votingScopeId!,
                  eligible: data.scopeEligible ?? true,
                  votingWeight: new Prisma.Decimal(
                    data.scopeVotingWeight ?? data.votingWeight,
                  ),
                },
                update: {
                  eligible: data.scopeEligible ?? true,
                  votingWeight: new Prisma.Decimal(
                    data.scopeVotingWeight ?? data.votingWeight,
                  ),
                },
              });
            }
          }
          const rowErrors = preview.rows.flatMap((row) => row.errors);
          const importedRows = preview.summary.valid;
          const record = await tx.registrationImport.create({
            data: {
              fileHash: preview.fileHash,
              fileName: body.data.fileName,
              totalRows: preview.summary.total,
              importedRows,
              rejectedRows: preview.summary.total - importedRows,
              errors: rowErrors as unknown as Prisma.InputJsonValue,
              createdBy: request.admin!.id,
            },
          });
          return { record, rowErrors } as const;
        },
        { timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
      );
      if (
        'previous' in result &&
        !('idempotent' in result && result.idempotent)
      )
        return reply.code(409).send({
          code: 'IMPORT_ALREADY_COMMITTED',
          importId: result.previous.id,
        });
      if ('previous' in result && result.idempotent) {
        const errors = result.previous.errors as unknown as ImportError[];
        return {
          import: result.previous,
          errorReportUrl: errors.length
            ? `/api/v1/admin/registration-imports/${result.previous.id}/errors.csv`
            : null,
        };
      }
      if ('invalid' in result)
        return reply
          .code(400)
          .send({ code: 'INVALID_CSV', preview: result.invalid });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'REGISTRATION_CSV_IMPORTED',
        targetType: 'RegistrationImport',
        targetId: result.record.id,
        sourceIp: request.ip,
        metadata: {
          mode: body.data.mode,
          fileHash: result.record.fileHash,
          totalRows: result.record.totalRows,
          importedRows: result.record.importedRows,
          rejectedRows: result.record.rejectedRows,
        },
      });
      return reply.code(201).send({
        import: result.record,
        errorReportUrl: result.rowErrors.length
          ? `/api/v1/admin/registration-imports/${result.record.id}/errors.csv`
          : null,
      });
    },
  );

  app.get(
    '/api/v1/admin/registration-imports/:id/errors.csv',
    {
      preHandler: app.requireRegistrationWrite,
      bodyLimit: MAX_IMPORT_JSON_BYTES,
    },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: 'INVALID_ID' });
      const record = await app.prisma.registrationImport.findUnique({
        where: { id: params.data.id },
      });
      if (!record) return reply.code(404).send({ code: 'IMPORT_NOT_FOUND' });
      const errors = record.errors as unknown as ImportError[];
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header(
        'content-disposition',
        `attachment; filename="registration-import-${record.id}-errors.csv"`,
      );
      return errorsToCsv(errors);
    },
  );
}
