DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RegistrationRecord"
    GROUP BY UPPER("unitNumber")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = $message$Cannot normalize unit numbers: case-insensitive duplicates exist$message$;
  END IF;
END
$migration$;

UPDATE "RegistrationRecord"
SET "unitNumber" = UPPER("unitNumber")
WHERE "unitNumber" <> UPPER("unitNumber");

ALTER TABLE "RegistrationRecord"
ADD CONSTRAINT "RegistrationRecord_unitNumber_uppercase_check"
CHECK ("unitNumber" = UPPER("unitNumber"));
