ALTER TABLE "AuditEvent" ADD COLUMN "chainIndex" INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "occurredAt" ASC, "id" ASC) AS n
  FROM "AuditEvent"
)
UPDATE "AuditEvent" AS event
SET "chainIndex" = ordered.n
FROM ordered
WHERE event.id = ordered.id;

CREATE SEQUENCE "AuditEvent_chainIndex_seq";

SELECT setval(
  '"AuditEvent_chainIndex_seq"',
  GREATEST(COALESCE((SELECT MAX("chainIndex") FROM "AuditEvent"), 0), 1),
  COALESCE((SELECT MAX("chainIndex") FROM "AuditEvent"), 0) > 0
);

ALTER TABLE "AuditEvent"
  ALTER COLUMN "chainIndex" SET DEFAULT nextval('"AuditEvent_chainIndex_seq"'),
  ALTER COLUMN "chainIndex" SET NOT NULL;

ALTER SEQUENCE "AuditEvent_chainIndex_seq" OWNED BY "AuditEvent"."chainIndex";

CREATE UNIQUE INDEX "AuditEvent_chainIndex_key" ON "AuditEvent"("chainIndex");

CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");
