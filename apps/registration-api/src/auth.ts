import { createHash, randomBytes } from 'node:crypto';
import { AdminStatus, ActorType, type AdminRole } from '@prisma/client';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { appendAudit } from './audit.js';
import { generateTotpSecret, totpAuthUrl, verifyTotp } from './totp.js';

const COOKIE = 'registration_session';
const totpCode = z.string().regex(/^\d{6}$/);
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
  totp: z.union([totpCode, z.literal('')]).optional(),
});
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(12).max(1024),
});
const totpConfirmSchema = z.object({ totp: totpCode });
const totpDisableSchema = z.object({
  password: z.string().min(1).max(1024),
  totp: z.union([totpCode, z.literal('')]).optional(),
});
const createAdminSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(1024),
  role: z.enum(['SYSTEM_ADMIN', 'REGISTRATION_OPERATOR', 'AUDITOR']),
});
const patchAdminSchema = z
  .object({
    role: z
      .enum(['SYSTEM_ADMIN', 'REGISTRATION_OPERATOR', 'AUDITOR'])
      .optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    unlock: z.literal(true).optional(),
  })
  .refine(
    (value) =>
      value.role !== undefined ||
      value.status !== undefined ||
      value.unlock === true,
  );
const userIdParams = z.object({ id: z.string().uuid() });
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const publicUser = (user: {
  id: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  totpEnabled: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
}) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  status: user.status,
  totpEnabled: user.totpEnabled,
  lockedUntil: user.lockedUntil?.toISOString() ?? null,
  createdAt: user.createdAt,
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticateAdmin: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<unknown>;
    requireSystemAdmin: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<unknown>;
    requireRegistrationWrite: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<unknown>;
  }
  interface FastifyRequest {
    admin?: {
      id: string;
      email: string;
      role: AdminRole;
      status: AdminStatus;
      totpEnabled: boolean;
      lockedUntil: Date | null;
      createdAt: Date;
    };
    sessionId?: string;
  }
}

/**
 * Increments failed-login count and locks the account after five failures.
 *
 * @param app - Fastify instance that owns the Prisma client.
 * @param adminId - Administrator whose failed-login counter is updated.
 * @param failedLoginCount - Current failure count before this attempt.
 */
/**
 * Whether an update would leave the system without an active system administrator.
 *
 * @param existing - Administrator being patched.
 * @param nextRole - Role after the patch.
 * @param nextStatus - Status after the patch.
 */
function dropsLastSystemAdmin(
  existing: { role: AdminRole; status: AdminStatus },
  nextRole: AdminRole,
  nextStatus: AdminStatus,
): boolean {
  return (
    existing.status === AdminStatus.ACTIVE &&
    existing.role === 'SYSTEM_ADMIN' &&
    (nextStatus === AdminStatus.INACTIVE || nextRole !== 'SYSTEM_ADMIN')
  );
}

async function recordFailedLogin(
  app: FastifyInstance,
  adminId: string,
  failedLoginCount: number,
) {
  const count = failedLoginCount + 1;
  await app.prisma.adminUser.update({
    where: { id: adminId },
    data: {
      failedLoginCount: count,
      lockedUntil: count >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
    },
  });
}

export function registerAuthRoutes(
  app: FastifyInstance,
  secureCookies: boolean,
) {
  const setCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: secureCookies,
      path: '/api/v1/admin',
      maxAge: 60 * 60 * 8,
    });
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[COOKIE];
    if (!token) return reply.code(401).send({ code: 'UNAUTHENTICATED' });
    const session = await app.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { admin: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.admin.status !== AdminStatus.ACTIVE
    )
      return reply.code(401).send({ code: 'UNAUTHENTICATED' });
    request.admin = session.admin;
    request.sessionId = session.id;
  };
  const systemAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (request.admin?.role !== 'SYSTEM_ADMIN')
      return reply.code(403).send({ code: 'FORBIDDEN' });
  };
  app.decorate('authenticateAdmin', authenticate);
  app.decorate('requireSystemAdmin', systemAdmin);
  app.decorate('requireRegistrationWrite', async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (
      !request.admin ||
      !['SYSTEM_ADMIN', 'REGISTRATION_OPERATOR'].includes(request.admin.role)
    )
      return reply.code(403).send({ code: 'FORBIDDEN' });
  });

  app.post(
    '/api/v1/admin/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      const email = parsed.data.email.trim().toLowerCase();
      const user = await app.prisma.adminUser.findUnique({ where: { email } });
      const valid = user
        ? await argon2.verify(user.passwordHash, parsed.data.password)
        : false;
      if (
        !user ||
        user.status !== AdminStatus.ACTIVE ||
        (user.lockedUntil && user.lockedUntil > new Date()) ||
        !valid
      ) {
        if (user && user.status === AdminStatus.ACTIVE)
          await recordFailedLogin(app, user.id, user.failedLoginCount);
        await appendAudit(app.prisma, {
          actorType: ActorType.ANONYMOUS,
          eventType: 'ADMIN_LOGIN_FAILED',
          targetType: 'AdminUser',
          ...(user ? { targetId: user.id } : {}),
          sourceIp: request.ip,
          metadata: { email },
        });
        return reply.code(401).send({ code: 'INVALID_CREDENTIALS' });
      }
      const totp = parsed.data.totp || undefined;
      if (user.totpEnabled) {
        if (!totp) return reply.code(401).send({ code: 'TOTP_REQUIRED' });
        if (!user.totpSecret || !verifyTotp(user.totpSecret, totp)) {
          await recordFailedLogin(app, user.id, user.failedLoginCount);
          await appendAudit(app.prisma, {
            actorType: ActorType.ANONYMOUS,
            eventType: 'ADMIN_LOGIN_FAILED',
            targetType: 'AdminUser',
            targetId: user.id,
            sourceIp: request.ip,
            metadata: { email, reason: 'TOTP_INVALID' },
          });
          return reply.code(401).send({ code: 'TOTP_INVALID' });
        }
      }
      const token = randomBytes(32).toString('base64url');
      await app.prisma.$transaction([
        app.prisma.adminUser.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null },
        }),
        app.prisma.adminSession.create({
          data: {
            adminId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 8 * 60 * 60_000),
          },
        }),
      ]);
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: user.id,
        eventType: 'ADMIN_LOGIN_SUCCEEDED',
        targetType: 'AdminUser',
        targetId: user.id,
        sourceIp: request.ip,
      });
      setCookie(reply, token);
      return { user: publicUser(user) };
    },
  );
  app.post(
    '/api/v1/admin/auth/logout',
    { preHandler: authenticate },
    async (request, reply) => {
      await app.prisma.adminSession.update({
        where: { id: request.sessionId! },
        data: { revokedAt: new Date() },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'ADMIN_LOGOUT',
        targetType: 'AdminUser',
        targetId: request.admin!.id,
        sourceIp: request.ip,
      });
      reply.clearCookie(COOKIE, { path: '/api/v1/admin' });
      return reply.code(204).send();
    },
  );
  app.post(
    '/api/v1/admin/auth/refresh',
    { preHandler: authenticate },
    async (request, reply) => {
      const token = randomBytes(32).toString('base64url');
      await app.prisma.adminSession.update({
        where: { id: request.sessionId! },
        data: {
          tokenHash: hashToken(token),
          rotatedAt: new Date(),
          expiresAt: new Date(Date.now() + 8 * 60 * 60_000),
        },
      });
      setCookie(reply, token);
      return { user: publicUser(request.admin!) };
    },
  );
  app.post(
    '/api/v1/admin/auth/password',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = passwordChangeSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      const admin = await app.prisma.adminUser.findUniqueOrThrow({
        where: { id: request.admin!.id },
      });
      const matches = await argon2.verify(
        admin.passwordHash,
        parsed.data.currentPassword,
      );
      if (!matches)
        return reply.code(401).send({ code: 'INVALID_CREDENTIALS' });
      if (parsed.data.currentPassword === parsed.data.newPassword)
        return reply.code(400).send({ code: 'PASSWORD_UNCHANGED' });
      await app.prisma.$transaction([
        app.prisma.adminUser.update({
          where: { id: admin.id },
          data: {
            passwordHash: await argon2.hash(parsed.data.newPassword, {
              type: argon2.argon2id,
            }),
            failedLoginCount: 0,
            lockedUntil: null,
          },
        }),
        app.prisma.adminSession.updateMany({
          where: {
            adminId: admin.id,
            revokedAt: null,
            NOT: { id: request.sessionId! },
          },
          data: { revokedAt: new Date() },
        }),
      ]);
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: admin.id,
        eventType: 'ADMIN_PASSWORD_CHANGED',
        targetType: 'AdminUser',
        targetId: admin.id,
        sourceIp: request.ip,
      });
      return { user: publicUser({ ...admin, totpEnabled: admin.totpEnabled }) };
    },
  );
  app.post(
    '/api/v1/admin/auth/totp/setup',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const admin = await app.prisma.adminUser.findUniqueOrThrow({
        where: { id: request.admin!.id },
      });
      if (admin.totpEnabled)
        return reply.code(409).send({ code: 'TOTP_ALREADY_ENABLED' });
      const secret = generateTotpSecret();
      await app.prisma.adminUser.update({
        where: { id: admin.id },
        data: { totpSecret: secret, totpEnabled: false },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: admin.id,
        eventType: 'ADMIN_TOTP_SETUP_STARTED',
        targetType: 'AdminUser',
        targetId: admin.id,
        sourceIp: request.ip,
      });
      return {
        secret,
        otpauthUrl: totpAuthUrl(admin.email, secret),
      };
    },
  );
  app.post(
    '/api/v1/admin/auth/totp/confirm',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = totpConfirmSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      const admin = await app.prisma.adminUser.findUniqueOrThrow({
        where: { id: request.admin!.id },
      });
      if (admin.totpEnabled)
        return reply.code(409).send({ code: 'TOTP_ALREADY_ENABLED' });
      if (!admin.totpSecret)
        return reply.code(409).send({ code: 'TOTP_NOT_STARTED' });
      if (!verifyTotp(admin.totpSecret, parsed.data.totp))
        return reply.code(401).send({ code: 'TOTP_INVALID' });
      const updated = await app.prisma.adminUser.update({
        where: { id: admin.id },
        data: { totpEnabled: true },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: admin.id,
        eventType: 'ADMIN_TOTP_ENABLED',
        targetType: 'AdminUser',
        targetId: admin.id,
        sourceIp: request.ip,
      });
      return { user: publicUser(updated) };
    },
  );
  app.post(
    '/api/v1/admin/auth/totp/disable',
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = totpDisableSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      const admin = await app.prisma.adminUser.findUniqueOrThrow({
        where: { id: request.admin!.id },
      });
      if (!admin.totpEnabled && !admin.totpSecret)
        return reply.code(409).send({ code: 'TOTP_NOT_ENABLED' });
      const matches = await argon2.verify(
        admin.passwordHash,
        parsed.data.password,
      );
      if (!matches)
        return reply.code(401).send({ code: 'INVALID_CREDENTIALS' });
      const totp = parsed.data.totp || undefined;
      if (admin.totpEnabled) {
        if (!totp) return reply.code(401).send({ code: 'TOTP_REQUIRED' });
        if (!admin.totpSecret || !verifyTotp(admin.totpSecret, totp))
          return reply.code(401).send({ code: 'TOTP_INVALID' });
      }
      const updated = await app.prisma.adminUser.update({
        where: { id: admin.id },
        data: { totpSecret: null, totpEnabled: false },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: admin.id,
        eventType: 'ADMIN_TOTP_DISABLED',
        targetType: 'AdminUser',
        targetId: admin.id,
        sourceIp: request.ip,
      });
      return { user: publicUser(updated) };
    },
  );
  app.get(
    '/api/v1/admin/me',
    { preHandler: authenticate },
    async (request) => ({ user: publicUser(request.admin!) }),
  );
  app.get('/api/v1/admin/users', { preHandler: systemAdmin }, async () => ({
    users: (
      await app.prisma.adminUser.findMany({ orderBy: { email: 'asc' } })
    ).map(publicUser),
  }));
  app.post(
    '/api/v1/admin/users',
    { preHandler: systemAdmin },
    async (request, reply) => {
      const parsed = createAdminSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ code: 'INVALID_REQUEST', issues: parsed.error.issues });
      const email = parsed.data.email.trim().toLowerCase();
      if (await app.prisma.adminUser.findUnique({ where: { email } }))
        return reply.code(409).send({ code: 'EMAIL_EXISTS' });
      const user = await app.prisma.adminUser.create({
        data: {
          email,
          passwordHash: await argon2.hash(parsed.data.password, {
            type: argon2.argon2id,
          }),
          role: parsed.data.role,
        },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'ADMIN_USER_CREATED',
        targetType: 'AdminUser',
        targetId: user.id,
        sourceIp: request.ip,
        metadata: { role: user.role },
      });
      return reply.code(201).send({ user: publicUser(user) });
    },
  );
  app.patch(
    '/api/v1/admin/users/:id',
    { preHandler: systemAdmin },
    async (request, reply) => {
      const params = userIdParams.safeParse(request.params);
      const body = patchAdminSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      const patch = body.data;
      const result = await app.prisma.$transaction(async (tx) => {
        const existing = await tx.adminUser.findUnique({
          where: { id: params.data.id },
        });
        if (!existing) return { error: 'USER_NOT_FOUND' as const, status: 404 };
        const nextRole = patch.role ?? existing.role;
        const nextStatus = patch.status ?? existing.status;
        if (dropsLastSystemAdmin(existing, nextRole, nextStatus)) {
          const others = await tx.adminUser.count({
            where: {
              id: { not: existing.id },
              role: 'SYSTEM_ADMIN',
              status: AdminStatus.ACTIVE,
            },
          });
          if (others === 0)
            return { error: 'LAST_SYSTEM_ADMIN' as const, status: 409 };
        }
        const updated = await tx.adminUser.update({
          where: { id: existing.id },
          data: {
            ...(patch.role ? { role: patch.role } : {}),
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.unlock ? { failedLoginCount: 0, lockedUntil: null } : {}),
          },
        });
        if (patch.status === AdminStatus.INACTIVE)
          await tx.adminSession.updateMany({
            where: { adminId: existing.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        return { updated };
      });
      if (!('updated' in result))
        return reply.code(result.status).send({ code: result.error });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'ADMIN_USER_UPDATED',
        targetType: 'AdminUser',
        targetId: result.updated.id,
        sourceIp: request.ip,
        metadata: {
          ...(patch.role ? { role: patch.role } : {}),
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.unlock ? { unlocked: true } : {}),
        },
      });
      return { user: publicUser(result.updated) };
    },
  );
  app.get(
    '/api/v1/admin/audit-events',
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = z
        .object({
          targetId: z.string().min(1).max(100).optional(),
          targetType: z.string().trim().min(1).max(100).optional(),
          eventType: z.string().trim().min(1).max(100).optional(),
          actorId: z.string().uuid().optional(),
          from: z.string().datetime({ offset: true }).optional(),
          to: z.string().datetime({ offset: true }).optional(),
        })
        .safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({ code: 'INVALID_QUERY' });
      const from = parsed.data.from ? new Date(parsed.data.from) : undefined;
      const to = parsed.data.to ? new Date(parsed.data.to) : undefined;
      if (from && to && from > to)
        return reply.code(400).send({ code: 'INVALID_QUERY' });
      return {
        events: await app.prisma.auditEvent.findMany({
          where: {
            ...(parsed.data.targetId ? { targetId: parsed.data.targetId } : {}),
            ...(parsed.data.targetType
              ? { targetType: parsed.data.targetType }
              : {}),
            ...(parsed.data.eventType
              ? { eventType: parsed.data.eventType }
              : {}),
            ...(parsed.data.actorId ? { actorId: parsed.data.actorId } : {}),
            ...(from || to
              ? {
                  occurredAt: {
                    ...(from ? { gte: from } : {}),
                    ...(to ? { lte: to } : {}),
                  },
                }
              : {}),
          },
          orderBy: { occurredAt: 'desc' },
          take: 100,
          select: {
            id: true,
            occurredAt: true,
            eventType: true,
            actorType: true,
            actorId: true,
            targetType: true,
            targetId: true,
            metadata: true,
          },
        }),
      };
    },
  );
}
