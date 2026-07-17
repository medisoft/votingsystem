import { ActorType, Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from './audit.js';
import {
  MAX_IMPORT_JSON_BYTES,
  canonicalUnitNumber,
  errorsToCsv,
  type ImportError,
  parseRegistrationCsv,
} from './csv-import.js';

const importBody = z.object({
  fileName: z.string().trim().min(1).max(255),
  csv: z.string(),
});
const idParams = z.object({ id: z.string().uuid() });
type ImportDb = PrismaClient | Prisma.TransactionClient;
export const REGISTRATION_WRITE_LOCK = 2026071705;

async function previewImport(db: ImportDb, csv: string) {
  const parsed = parseRegistrationCsv(csv);
  if (parsed.errors.length)
    return {
      fileHash: parsed.fileHash,
      rows: parsed.rows,
      errors: parsed.errors,
      summary: { total: 0, valid: 0, rejected: 0 },
    };
  const unitKeys = parsed.rows.flatMap((row) =>
    row.data ? [canonicalUnitNumber(row.data.unitNumber)] : [],
  );
  const existingRecords = unitKeys.length
    ? await db.$queryRaw<Array<{ unitNumber: string }>>(
        Prisma.sql`SELECT "unitNumber" FROM "RegistrationRecord" WHERE LOWER("unitNumber") IN (${Prisma.join(unitKeys)})`,
      )
    : [];
  const existing = new Set(
    existingRecords.map((record) => canonicalUnitNumber(record.unitNumber)),
  );
  const rows = parsed.rows.map((row) =>
    row.data && existing.has(canonicalUnitNumber(row.data.unitNumber))
      ? {
          ...row,
          data: undefined,
          errors: [
            {
              row: row.row,
              field: 'unit_number',
              code: 'DUPLICATE_EXISTING',
              message: 'Unit identifier already exists.',
            },
          ],
        }
      : row,
  );
  const valid = rows.filter((row) => row.data).length;
  return {
    fileHash: parsed.fileHash,
    rows,
    errors: [] as ImportError[],
    summary: { total: rows.length, valid, rejected: rows.length - valid },
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
      const preview = await previewImport(app.prisma, body.data.csv);
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
      const result = await app.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_WRITE_LOCK})`,
        );
        const fileHash = parseRegistrationCsv(body.data.csv).fileHash;
        const previous = await tx.registrationImport.findUnique({
          where: { fileHash },
        });
        if (previous) return { previous } as const;
        const preview = await previewImport(tx, body.data.csv);
        if (preview.errors.length || preview.summary.valid === 0)
          return { invalid: preview } as const;
        const validRows = preview.rows.flatMap((row) =>
          row.data ? [row.data] : [],
        );
        if (validRows.length)
          await tx.registrationRecord.createMany({
            data: validRows.map((row) => ({
              ...row,
              votingWeight: new Prisma.Decimal(row.votingWeight),
            })),
          });
        const rowErrors = preview.rows.flatMap((row) => row.errors);
        const record = await tx.registrationImport.create({
          data: {
            fileHash: preview.fileHash,
            fileName: body.data.fileName,
            totalRows: preview.summary.total,
            importedRows: preview.summary.valid,
            rejectedRows: preview.summary.rejected,
            errors: rowErrors as unknown as Prisma.InputJsonValue,
            createdBy: request.admin!.id,
          },
        });
        return { record, rowErrors } as const;
      });
      if ('previous' in result)
        return reply.code(409).send({
          code: 'IMPORT_ALREADY_COMMITTED',
          importId: result.previous.id,
        });
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
