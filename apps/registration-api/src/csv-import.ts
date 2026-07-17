import { createHash } from 'node:crypto';
import { RegistrationStatus } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 5000;
// JSON may escape each input byte as a six-character Unicode escape.
export const MAX_IMPORT_JSON_BYTES = MAX_CSV_BYTES * 6 + 4096;
export const requiredHeaders = ['unit_number', 'owner_name'] as const;
export const supportedHeaders = [
  ...requiredHeaders,
  'representative_name',
  'email',
  'phone',
  'voting_weight',
  'eligible',
  'status',
  'notes',
] as const;

export interface ImportError {
  row: number;
  field: string;
  code: string;
  message: string;
}

export interface ImportRow {
  row: number;
  data?: {
    unitNumber: string;
    ownerName: string;
    representativeName: string | null;
    email: string | null;
    phone: string | null;
    votingWeight: string;
    eligible: boolean;
    status: RegistrationStatus;
    notes: string | null;
  };
  errors: ImportError[];
}

const rowSchema = z.object({
  unit_number: z.string().trim().min(1).max(100),
  owner_name: z.string().trim().min(1).max(300),
  representative_name: z.string().trim().max(300).optional().default(''),
  email: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z
      .union([z.literal(''), z.string().email().max(254)])
      .optional()
      .default(''),
  ),
  phone: z.string().trim().max(50).optional().default(''),
  voting_weight: z
    .string()
    .trim()
    .optional()
    .default('1.0000')
    .refine(
      (value) => /^\d{1,8}(\.\d{1,4})?$/.test(value) && Number(value) > 0,
    ),
  eligible: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .default('true')
      .refine((value) => value === 'true' || value === 'false'),
  ),
  status: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z
      .nativeEnum(RegistrationStatus)
      .optional()
      .default(RegistrationStatus.ACTIVE),
  ),
  notes: z.string().trim().max(5000).optional().default(''),
});

function blankToUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

interface CsvRecord {
  values: string[];
  row: number;
}

function countLineBreaks(value: string) {
  return value.match(/\r\n|\r|\n/g)?.length ?? 0;
}

function parseCsvRecords(csv: string): CsvRecord[] {
  const parsed = parse(csv, {
    bom: true,
    info: true,
    raw: true,
    relax_column_count: true,
    relax_quotes: false,
    rtrim: true,
    skip_empty_lines: true,
  }) as unknown as Array<{
    record: string[];
    raw: string;
    info: { lines: number };
  }>;
  let nextRow = 1;
  return parsed.map(({ record, raw }) => {
    const leadingEmptyLines = raw.match(/^(?:(?:\r\n|\r|\n))+/);
    const row = nextRow + countLineBreaks(leadingEmptyLines?.[0] ?? '');
    nextRow += countLineBreaks(raw);
    return { values: record, row };
  });
}

function csvErrorRow(error: unknown) {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('lines' in error) ||
    typeof error.lines !== 'number'
  )
    return 1;
  const raw = 'raw' in error && typeof error.raw === 'string' ? error.raw : '';
  const endsWithLineBreak = raw.endsWith('\n') || raw.endsWith('\r');
  return Math.max(
    1,
    error.lines - countLineBreaks(raw) + (endsWithLineBreak ? 1 : 0),
  );
}

function csvErrorMessage(error: unknown) {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'CSV_QUOTE_NOT_CLOSED'
    ? 'CSV contains an unclosed quoted field.'
    : 'CSV syntax is invalid.';
}

export function hashCsv(csv: string) {
  return createHash('sha256').update(csv, 'utf8').digest('hex');
}

export function parseRegistrationCsv(csv: string): {
  fileHash: string;
  rows: ImportRow[];
  errors: ImportError[];
} {
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES)
    return {
      fileHash: hashCsv(csv),
      rows: [],
      errors: [
        {
          row: 1,
          field: 'file',
          code: 'FILE_TOO_LARGE',
          message: 'CSV exceeds 2 MiB.',
        },
      ],
    };
  let records: CsvRecord[];
  try {
    records = parseCsvRecords(csv);
  } catch (error) {
    return {
      fileHash: hashCsv(csv),
      rows: [],
      errors: [
        {
          row: csvErrorRow(error),
          field: 'file',
          code: 'INVALID_CSV',
          message: csvErrorMessage(error),
        },
      ],
    };
  }
  if (!records.length)
    return {
      fileHash: hashCsv(csv),
      rows: [],
      errors: [
        { row: 1, field: 'file', code: 'EMPTY_FILE', message: 'CSV is empty.' },
      ],
    };
  const headers = records[0]!.values.map((header) =>
    header.trim().toLowerCase(),
  );
  const headerRow = records[0]!.row;
  const fileErrors: ImportError[] = [];
  for (const header of requiredHeaders)
    if (!headers.includes(header))
      fileErrors.push({
        row: headerRow,
        field: header,
        code: 'MISSING_HEADER',
        message: `Required header ${header} is missing.`,
      });
  headers.forEach((header, index) => {
    if (!header)
      fileErrors.push({
        row: headerRow,
        field: `column_${index + 1}`,
        code: 'EMPTY_HEADER',
        message: 'Header cannot be empty.',
      });
    else if (
      !supportedHeaders.includes(header as (typeof supportedHeaders)[number])
    )
      fileErrors.push({
        row: headerRow,
        field: header,
        code: 'UNKNOWN_HEADER',
        message: `Header ${header} is not supported.`,
      });
    else if (headers.indexOf(header) !== index)
      fileErrors.push({
        row: headerRow,
        field: header,
        code: 'DUPLICATE_HEADER',
        message: `Header ${header} appears more than once.`,
      });
  });
  if (records.length - 1 > MAX_CSV_ROWS)
    fileErrors.push({
      row: headerRow,
      field: 'file',
      code: 'TOO_MANY_ROWS',
      message: `CSV may contain at most ${MAX_CSV_ROWS} data rows.`,
    });
  if (fileErrors.length)
    return { fileHash: hashCsv(csv), rows: [], errors: fileErrors };
  const seen = new Set<string>();
  const rows = records
    .slice(1, MAX_CSV_ROWS + 1)
    .map(({ values, row }): ImportRow => {
      if (values.length !== headers.length)
        return {
          row,
          errors: [
            {
              row,
              field: 'row',
              code: 'COLUMN_COUNT',
              message: `Expected ${headers.length} columns but received ${values.length}.`,
            },
          ],
        };
      const raw: Record<string, string | undefined> = Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? '']),
      );
      for (const field of ['voting_weight', 'eligible', 'status'])
        if (blankToUndefined(raw[field]) === undefined) raw[field] = undefined;
      const parsed = rowSchema.safeParse(raw);
      if (!parsed.success)
        return {
          row,
          errors: parsed.error.issues.map((issue) => ({
            row,
            field: String(issue.path[0] ?? 'row'),
            code: 'INVALID_FIELD',
            message: 'Field value is invalid.',
          })),
        };
      const unitKey = canonicalUnitNumber(parsed.data.unit_number);
      if (seen.has(unitKey))
        return {
          row,
          errors: [
            {
              row,
              field: 'unit_number',
              code: 'DUPLICATE_IN_FILE',
              message:
                'Unit identifier is duplicated in this CSV; the first row wins.',
            },
          ],
        };
      seen.add(unitKey);
      return {
        row,
        errors: [],
        data: {
          unitNumber: canonicalUnitNumber(parsed.data.unit_number),
          ownerName: parsed.data.owner_name,
          representativeName: parsed.data.representative_name || null,
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
          votingWeight: parsed.data.voting_weight,
          eligible: parsed.data.eligible === 'true',
          status: parsed.data.status,
          notes: parsed.data.notes || null,
        },
      };
    });
  return { fileHash: hashCsv(csv), rows, errors: [] };
}

export function canonicalUnitNumber(unitNumber: string) {
  return unitNumber.toLocaleUpperCase('en');
}

export function errorsToCsv(errors: ImportError[]) {
  const quote = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;
  return [
    'row,field,code,message',
    ...errors.map((error) =>
      [error.row, error.field, error.code, error.message].map(quote).join(','),
    ),
  ].join('\n');
}
