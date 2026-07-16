import { createHash, randomBytes } from 'node:crypto';
import { AdminStatus, ActorType, type AdminRole } from '@prisma/client';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { appendAudit } from './audit.js';

const COOKIE = 'registration_session';
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
});
const createAdminSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(1024),
  role: z.enum(['SYSTEM_ADMIN', 'REGISTRATION_OPERATOR', 'AUDITOR']),
});
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const publicUser = (user: {
  id: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  createdAt: Date;
}) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  status: user.status,
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
  }
  interface FastifyRequest {
    admin?: {
      id: string;
      email: string;
      role: AdminRole;
      status: AdminStatus;
      createdAt: Date;
    };
    sessionId?: string;
  }
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
        if (user && user.status === AdminStatus.ACTIVE) {
          const count = user.failedLoginCount + 1;
          await app.prisma.adminUser.update({
            where: { id: user.id },
            data: {
              failedLoginCount: count,
              lockedUntil:
                count >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
            },
          });
        }
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
  app.get(
    '/api/v1/admin/audit-events',
    { preHandler: authenticate },
    async () => ({
      events: await app.prisma.auditEvent.findMany({
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
    }),
  );
}
