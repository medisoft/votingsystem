/**
 * Opens the rear camera for live QR scanning.
 *
 * @returns A media stream whose tracks must be stopped by the caller.
 */
export async function startCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Camera is not available');
    error.name = 'NotFoundError';
    throw error;
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
}

/**
 * Stops every track on a camera stream.
 *
 * @param stream - Stream returned by {@link startCameraStream}, if any.
 */
export function stopCameraStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Maps getUserMedia failures to a small UI state.
 *
 * @param error - Rejection from {@link startCameraStream}.
 * @returns `denied` when the user blocked the camera, otherwise `unavailable`.
 */
export function classifyCameraError(error: unknown): 'denied' | 'unavailable' {
  const name =
    error instanceof DOMException || error instanceof Error ? error.name : '';
  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError'
  ) {
    return 'denied';
  }
  return 'unavailable';
}
