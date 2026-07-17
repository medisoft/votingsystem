import { describe, expect, it } from 'vitest';
import {
  canonicalUnitNumber,
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

  it('normalizes unit identifiers to uppercase', () => {
    expect(canonicalUnitNumber('a-101')).toBe('A-101');
    expect(
      parseRegistrationCsv(`unit_number,owner_name
a-101,Owner
`).rows[0]?.data?.unitNumber,
    ).toBe('A-101');
  });

  it('trims padded emails and defaults whitespace-only emails', () => {
    const result = parseRegistrationCsv(
      `unit_number,owner_name,email
A-1,Owner,~owner@example.com~
A-2,Other,~~~
`.replaceAll('~', ' '),
    );
    expect(result.rows[0]?.data?.email).toBe('owner@example.com');
    expect(result.rows[1]?.data?.email).toBeNull();
  });

  it('reports malformed headers on their physical row', () => {
    const result = parseRegistrationCsv(
      `

unit_number,unexpected
A-1,value
`,
    );
    expect(result.errors).not.toHaveLength(0);
    expect(result.errors.every((error) => error.row === 3)).toBe(true);
  });

  it('reports an unclosed quote at the record starting row', () => {
    const result = parseRegistrationCsv(
      `unit_number,owner_name
A-1,"Unclosed owner`,
    );
    expect(result.errors[0]).toMatchObject({ row: 2, code: 'INVALID_CSV' });
  });

  it('validates delimiter-only rows while skipping physical blank lines', () => {
    const result = parseRegistrationCsv(
      `unit_number,owner_name

,
`,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.row).toBe(3);
    expect(result.rows[0]?.data).toBeUndefined();
    expect(result.rows[0]?.errors.map((error) => error.field)).toEqual(
      expect.arrayContaining(['unit_number', 'owner_name']),
    );
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
