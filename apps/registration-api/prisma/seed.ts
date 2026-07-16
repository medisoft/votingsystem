import { AdminRole } from '@prisma/client';
import argon2 from 'argon2';
import { prisma } from '../src/plugins/database.js';

const email = (process.env.ADMIN_EMAIL ?? 'admin@example.com')
  .trim()
  .toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12)
  throw new Error('ADMIN_PASSWORD must contain at least 12 characters');
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
await prisma.adminUser.upsert({
  where: { email },
  update: {
    passwordHash,
    role: AdminRole.SYSTEM_ADMIN,
    status: 'ACTIVE',
    failedLoginCount: 0,
    lockedUntil: null,
  },
  create: { email, passwordHash, role: AdminRole.SYSTEM_ADMIN },
});
console.log('Initial administrator is ready:', email);
await prisma.$disconnect();
