import { prisma } from './plugins/database.js';
import { verifyStoredAuditChain } from './audit.js';

const result = await verifyStoredAuditChain(prisma);
await prisma.$disconnect();
if (result.valid) {
  process.stdout.write(
    `audit chain valid: ${result.eventCount} events${
      result.tipHash ? `, tip=${result.tipHash}` : ''
    }\n`,
  );
  process.exit(0);
}
process.stderr.write(`audit chain invalid: ${result.reason ?? 'unknown'}\n`);
process.exit(1);
