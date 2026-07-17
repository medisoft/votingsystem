import { describe, expect, it } from 'vitest';
import {
  MAX_CSV_BYTES,
  MAX_IMPORT_JSON_BYTES,
  errorsToCsv,
  parseRegistrationCsv,
} from '../src/csv-import.js';

describe('registration CSV parsing', () => {
  it('parses quoted fields, defaults, and booleans', () => {
    const result = parseRegistrationCsv(
      'unit_number,owner_name,notes,eligible\r\nA-1,"Owner, One","Line 1\nLine 2",false\r\n',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.data).toMatchObject({
      unitNumber: 'A-1',
      ownerName: 'Owner, One',
      notes: 'Line 1\nLine 2',
      eligible: false,
      votingWeight: '1.0000',
    });
  });

  it('applies defaults to blank optional cells', () => {
    const result = parseRegistrationCsv(
      `unit_number,owner_name,voting_weight,eligible,status
A-1,Owner,,,
`,
    );
    expect(result.rows[0]?.data).toMatchObject({
      votingWeight: '1.0000',
      eligible: true,
      status: 'ACTIVE',
    });
  });

  it('preserves physical row numbers after blank lines', () => {
    const result = parseRegistrationCsv(
      `unit_number,owner_name,email

A-1,Owner,invalid
`,
    );
    expect(result.rows[0]?.errors[0]?.row).toBe(3);
  });

  it('uses stable validation messages without rejected source values', () => {
    const rejected = 'NOT_A_REAL_STATUS';
    const result = parseRegistrationCsv(
      `unit_number,owner_name,status
A-1,Owner,${rejected}
`,
    );
    expect(result.rows[0]?.errors[0]?.message).toBe('Field value is invalid.');
    expect(errorsToCsv(result.rows[0]!.errors)).not.toContain(rejected);
  });

  it('allows worst-case JSON encoding overhead around the CSV limit', () => {
    expect(MAX_IMPORT_JSON_BYTES).toBeGreaterThan(MAX_CSV_BYTES * 6);
  });

  it('reports field errors and deterministically rejects later duplicate rows', () => {
    const result = parseRegistrationCsv(
      'unit_number,owner_name,email\nA-1,Owner,owner@example.com\na-1,Other,other@example.com\nB-1,Bad,invalid\n',
    );
    expect(result.rows[2]?.errors[0]).toMatchObject({
      row: 4,
      field: 'email',
      code: 'INVALID_FIELD',
    });
    expect(result.rows[1]?.errors[0]).toMatchObject({
      row: 3,
      field: 'unit_number',
      code: 'DUPLICATE_IN_FILE',
    });
  });

  it('rejects missing and unknown headers', () => {
    const result = parseRegistrationCsv('unit_number,unexpected\nA-1,value\n');
    expect(result.errors.map((error) => error.code)).toEqual([
      'MISSING_HEADER',
      'UNKNOWN_HEADER',
    ]);
  });

  it('creates a CSV error report without source field values', () => {
    const report = errorsToCsv([
      {
        row: 2,
        field: 'email',
        code: 'INVALID_FIELD',
        message: 'Invalid email',
      },
    ]);
    expect(report).toContain('row,field,code,message');
    expect(report).toContain('"2","email","INVALID_FIELD","Invalid email"');
  });
});
