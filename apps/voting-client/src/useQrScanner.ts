import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyCameraError,
  startCameraStream,
  stopCameraStream,
} from './camera';
import { detectQrFromSource } from './qr-detect';

export type CameraStatus =
  'idle' | 'starting' | 'scanning' | 'denied' | 'unavailable';

const SCAN_INTERVAL_MS = 250;

/**
 * Opens the device camera, polls frames for a QR payload, and stops tracks
 * on unmount.
 *
 * @returns Video ref, camera status, the latest raw QR text, and controls.
 */
export function useQrScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRawRef = useRef<string | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [lastRaw, setLastRaw] = useState<string | null>(null);

  const stop = useCallback(() => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    setStatus('starting');
    try {
      const stream = await startCameraStream();
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopCameraStream(stream);
        streamRef.current = null;
        setStatus('unavailable');
        return;
      }
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      try {
        await video.play();
      } catch {
        /* Autoplay policies and jsdom throw rather than reject. */
      }
      setStatus('scanning');
    } catch (error) {
      setStatus(classifyCameraError(error));
    }
  }, []);

  const acceptRaw = useCallback((text: string) => {
    if (lastRawRef.current === text) return;
    lastRawRef.current = text;
    setLastRaw(text);
  }, []);

  const clearLast = useCallback(() => {
    lastRawRef.current = null;
    setLastRaw(null);
  }, []);

  useEffect(() => {
    return () => {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status !== 'scanning') return;
    let cancelled = false;
    const tick = async () => {
      const video = videoRef.current;
      if (!video || cancelled) return;
      const text = await detectQrFromSource(video);
      if (text && !cancelled) acceptRaw(text);
    };
    void tick();
    const id = window.setInterval(() => void tick(), SCAN_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [status, acceptRaw]);

  return { videoRef, status, lastRaw, start, stop, acceptRaw, clearLast };
}
