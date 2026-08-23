import { describe, expect, it } from 'vitest';
import { classifyCameraError } from './camera';

describe('classifyCameraError', () => {
  it('treats permission and security failures as denied', () => {
    expect(
      classifyCameraError(
        Object.assign(new Error('x'), { name: 'NotAllowedError' }),
      ),
    ).toBe('denied');
    expect(
      classifyCameraError(
        Object.assign(new Error('x'), { name: 'PermissionDeniedError' }),
      ),
    ).toBe('denied');
    expect(
      classifyCameraError(
        Object.assign(new Error('x'), { name: 'SecurityError' }),
      ),
    ).toBe('denied');
  });

  it('treats missing hardware and unknown errors as unavailable', () => {
    expect(
      classifyCameraError(
        Object.assign(new Error('x'), { name: 'NotFoundError' }),
      ),
    ).toBe('unavailable');
    expect(classifyCameraError('nope')).toBe('unavailable');
  });
});
