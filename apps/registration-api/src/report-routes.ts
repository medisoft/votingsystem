import { ActorType } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { appendAudit } from './audit.js';
import {
  activationSummary,
  activationSummaryCsv,
  credentialStatusCsv,
  credentialStatusReport,
  registrationSummary,
  registrationSummaryCsv,
  type ReportKind,
} from './reports.js';

const asOfQuery = z.object({
  asOf: z.string().datetime({ offset: true }).optional(),
});

/**
 * Parses an optional RFC 3339 asOf query used to freeze report snapshots.
 *
 * @param query - Raw Fastify querystring object.
 * @returns A valid instant, or null when the query is malformed.
 */
function parseAsOf(query: unknown): Date | null {
  const parsed = asOfQuery.safeParse(query);
  if (!parsed.success) return null;
  return parsed.data.asOf ? new Date(parsed.data.asOf) : new Date();
}

/**
 * Writes a CSV attachment that auditors and administrators can download.
 *
 * @param reply - Fastify reply used to set download headers.
 * @param kind - Report identifier included in the filename.
 * @param body - Deterministic CSV text.
 */
function sendCsv(reply: FastifyReply, kind: ReportKind, body: string) {
  reply.header('content-type', 'text/csv; charset=utf-8');
  reply.header('content-disposition', `attachment; filename="${kind}.csv"`);
  return reply.send(body);
}

/**
 * Records that an operational report was exported, without snapshot contents.
 *
 * @param app - Fastify instance that owns Prisma.
 * @param request - Authenticated administrator request.
 * @param kind - Report that was exported.
 * @param asOf - Snapshot instant written to audit metadata.
 */
async function auditExport(
  app: FastifyInstance,
  request: FastifyRequest,
  kind: ReportKind,
  asOf: Date,
) {
  await appendAudit(app.prisma, {
    actorType: ActorType.ADMIN,
    actorId: request.admin!.id,
    eventType: 'REPORT_EXPORTED',
    targetType: 'Report',
    targetId: kind,
    sourceIp: request.ip,
    metadata: {
      report: kind,
      format: 'csv',
      asOf: asOf.toISOString(),
    },
  });
}

/**
 * Registers read-only operational report endpoints.
 *
 * @param app - Fastify instance with administrator authentication.
 */
export function registerReportRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/admin/reports/registration-summary',
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const asOf = parseAsOf(request.query);
      if (!asOf) return reply.code(400).send({ code: 'INVALID_QUERY' });
      return { report: await registrationSummary(app.prisma, asOf) };
    },
  );
  app.get(
    '/api/v1/admin/reports/activation-summary',
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const asOf = parseAsOf(request.query);
      if (!asOf) return reply.code(400).send({ code: 'INVALID_QUERY' });
      return { report: await activationSummary(app.prisma, asOf) };
    },
  );
  app.get(
    '/api/v1/admin/reports/credential-status',
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const asOf = parseAsOf(request.query);
      if (!asOf) return reply.code(400).send({ code: 'INVALID_QUERY' });
      return { report: await credentialStatusReport(app.prisma, asOf) };
    },
  );
  app.get(
    '/api/v1/admin/reports/registration-summary.csv',
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const asOf = parseAsOf(request.query);
      if (!asOf) return reply.code(400).send({ code: 'INVALID_QUERY' });
      const report = await registrationSummary(app.prisma, asOf);
      await auditExport(app, request, 'registration-summary', asOf);
      return sendCsv(
        reply,
        'registration-summary',
        registrationSummaryCsv(report),
      );
    },
  );
  app.get(
    '/api/v1/admin/reports/activation-summary.csv',
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const asOf = parseAsOf(request.query);
      if (!asOf) return reply.code(400).send({ code: 'INVALID_QUERY' });
      const report = await activationSummary(app.prisma, asOf);
      await auditExport(app, request, 'activation-summary', asOf);
      return sendCsv(reply, 'activation-summary', activationSummaryCsv(report));
    },
  );
  app.get(
    '/api/v1/admin/reports/credential-status.csv',
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const asOf = parseAsOf(request.query);
      if (!asOf) return reply.code(400).send({ code: 'INVALID_QUERY' });
      const report = await credentialStatusReport(app.prisma, asOf);
      await auditExport(app, request, 'credential-status', asOf);
      return sendCsv(reply, 'credential-status', credentialStatusCsv(report));
    },
  );
}
