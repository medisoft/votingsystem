import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectQrFromSource, resetNativeQrDetectorCache } from './qr-detect';

afterEach(() => {
  resetNativeQrDetectorCache();
  vi.unstubAllGlobals();
});

describe('detectQrFromSource', () => {
  it('returns text from the native BarcodeDetector when it is available', async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: 'opaque-token' }]);
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        detect = detect;
      },
    );
    const video = document.createElement('video');
    await expect(detectQrFromSource(video)).resolves.toBe('opaque-token');
    expect(detect).toHaveBeenCalledOnce();
  });

  it('returns null when the native detector sees no code', async () => {
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        detect = vi.fn().mockResolvedValue([]);
      },
    );
    await expect(
      detectQrFromSource(document.createElement('video')),
    ).resolves.toBeNull();
  });

  it('falls back to the JS decoder when BarcodeDetector throws', async () => {
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        detect = vi.fn().mockRejectedValue(new Error('flag disabled'));
      },
    );
    const video = document.createElement('video');
    await expect(detectQrFromSource(video)).resolves.toBeNull();
  });
});
