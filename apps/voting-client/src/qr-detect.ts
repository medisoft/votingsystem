type NativeQrDetector = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = new (options: {
  formats: string[];
}) => NativeQrDetector;

const MAX_DECODE_EDGE = 720;

let nativeDetector: NativeQrDetector | null | undefined;
let rasterCanvas: HTMLCanvasElement | null = null;

/**
 * Returns the browser BarcodeDetector when QR support is actually available.
 * Safari currently exposes the constructor behind a disabled flag; callers
 * must still have a JavaScript decoder.
 */
export function getNativeQrDetector(): NativeQrDetector | null {
  if (nativeDetector !== undefined) return nativeDetector;
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  if (!Detector) {
    nativeDetector = null;
    return nativeDetector;
  }
  try {
    nativeDetector = new Detector({ formats: ['qr_code'] });
  } catch {
    nativeDetector = null;
  }
  return nativeDetector;
}

/** Clears the cached BarcodeDetector instance. Used by tests. */
export function resetNativeQrDetectorCache(): void {
  nativeDetector = undefined;
}

/**
 * Reads QR text from a camera frame, photo, or bitmap.
 *
 * Prefers the native BarcodeDetector (Chrome/Android). Falls back to the
 * bundled ZXing port when that API is missing or throws, so iPhone Safari
 * and Firefox still scan without WASM (which would need extra CSP).
 *
 * @param source - Live video, image, canvas, or decoded bitmap.
 * @returns The QR payload, or null when no code is in view.
 */
export async function detectQrFromSource(
  source: CanvasImageSource,
): Promise<string | null> {
  const native = getNativeQrDetector();
  if (native) {
    try {
      const codes = await native.detect(source as ImageBitmapSource);
      return codes.find((code) => code.rawValue)?.rawValue ?? null;
    } catch {
      /* Native API present but unusable; try the JS decoder. */
    }
  }
  const imageData = rasterizeToImageData(source);
  if (!imageData) return null;
  return decodeQrImageData(imageData);
}

/**
 * Decodes a QR code from RGBA image data using ZXing.
 *
 * @param imageData - Pixels from a canvas snapshot of the camera or photo.
 * @returns The QR payload, or null when ZXing finds no valid QR.
 */
export async function decodeQrImageData(
  imageData: ImageData,
): Promise<string | null> {
  const { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } =
    await import('@zxing/library');
  const luminances = toLuminance(
    imageData.data,
    imageData.width,
    imageData.height,
  );
  const bitmap = new BinaryBitmap(
    new HybridBinarizer(
      new RGBLuminanceSource(luminances, imageData.width, imageData.height),
    ),
  );
  try {
    return new QRCodeReader().decode(bitmap).getText();
  } catch {
    return null;
  }
}

function rasterizeToImageData(source: CanvasImageSource): ImageData | null {
  const size = sourceSize(source);
  if (!size) return null;
  const scale = Math.min(
    1,
    MAX_DECODE_EDGE / Math.max(size.width, size.height),
  );
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const canvas = getRasterCanvas();
  if (!canvas) return null;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  try {
    return context.getImageData(0, 0, width, height);
  } catch {
    return null;
  }
}

function getRasterCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  rasterCanvas ??= document.createElement('canvas');
  return rasterCanvas;
}

function sourceSize(
  source: CanvasImageSource,
): { width: number; height: number } | null {
  if (source instanceof HTMLVideoElement) {
    if (!source.videoWidth) return null;
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    if (!source.naturalWidth) return null;
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  return null;
}

function toLuminance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const luminances = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < luminances.length; i++, p += 4) {
    const r = data[p] ?? 0;
    const g = data[p + 1] ?? 0;
    const b = data[p + 2] ?? 0;
    luminances[i] = (r * 299 + g * 587 + b * 114 + 500) / 1000;
  }
  return luminances;
}
