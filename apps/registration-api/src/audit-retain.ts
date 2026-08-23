import { loadConfig } from './config.js';
import { prisma } from './plugins/database.js';
import { countArchivableAuditEvents } from './retention.js';

const config = loadConfig();
const result = await countArchivableAuditEvents(prisma, {
  auditRetentionDays: config.AUDIT_RETENTION_DAYS,
  applicationLogRetentionDays: config.APPLICATION_LOG_RETENTION_DAYS,
  sourceIpMode: config.SOURCE_IP_MODE,
});
process.stdout.write(
  `${JSON.stringify({
    auditRetentionDays: config.AUDIT_RETENTION_DAYS,
    applicationLogRetentionDays: config.APPLICATION_LOG_RETENTION_DAYS,
    sourceIpMode: config.SOURCE_IP_MODE,
    cutoff: result.cutoff.toISOString(),
    archivableEventCount: result.eventCount,
    deleted: false,
  })}\n`,
);
await prisma.$disconnect();
