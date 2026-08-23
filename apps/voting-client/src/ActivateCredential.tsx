import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import { ClientShell } from './ClientShell';
import { useI18n } from './i18n/I18nProvider';
import { activationTokenPrefix, parseActivationQr } from './parseActivationQr';
import { detectQrFromSource } from './qr-detect';
import { clientRoutes } from './routes';
import { useClientStore } from './store';
import { useQrScanner } from './useQrScanner';

/**
 * Stage 2 activation screen: camera QR scan, photo of a QR, or pasted token.
 * Key generation and the registration API are later stages.
 */
export function ActivateCredential() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scanError, setScanError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const activationToken = useClientStore((state) => state.activationToken);
  const setActivationToken = useClientStore(
    (state) => state.setActivationToken,
  );
  const { videoRef, status, lastRaw, start, stop, acceptRaw, clearLast } =
    useQrScanner();

  useEffect(() => {
    const fromQuery = searchParams.get('token');
    if (fromQuery === null) return;
    const parsed = parseActivationQr(fromQuery);
    if (parsed.ok) {
      setActivationToken(parsed.token);
      setScanError(false);
    } else {
      setScanError(true);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, setActivationToken]);

  useEffect(() => {
    if (!lastRaw) return;
    const parsed = parseActivationQr(lastRaw);
    if (!parsed.ok) {
      setScanError(true);
      return;
    }
    stop();
    setScanError(false);
    setActivationToken(parsed.token);
  }, [lastRaw, stop, setActivationToken]);

  const onSubmitToken = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const parsed = parseActivationQr(String(form.get('token') ?? ''));
      if (!parsed.ok) {
        setScanError(true);
        return;
      }
      stop();
      setScanError(false);
      setActivationToken(parsed.token);
    },
    [stop, setActivationToken],
  );

  const onPickPhoto = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const bitmap = await createImageBitmap(file);
        const text = await detectQrFromSource(bitmap);
        bitmap.close();
        if (text) acceptRaw(text);
        else setScanError(true);
      } catch {
        setScanError(true);
      }
    },
    [acceptRaw],
  );

  const scanAgain = useCallback(() => {
    setActivationToken(null);
    setScanError(false);
    clearLast();
  }, [setActivationToken, clearLast]);

  const showViewport = status === 'starting' || status === 'scanning';

  return (
    <ClientShell title={t('activateTitle')}>
      {activationToken ? (
        <>
          <p className="success" role="status">
            {t('scanSuccess', {
              prefix: activationTokenPrefix(activationToken),
            })}
          </p>
          <div className="actions">
            <button type="button" className="secondary" onClick={scanAgain}>
              {t('scanAgain')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{t('activateExplanation')}</p>
          <div className="qr-viewport" hidden={!showViewport}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              aria-label={t('cameraPreview')}
            />
            <div className="qr-frame" aria-hidden="true" />
          </div>
          {status === 'scanning' && <p role="status">{t('scanningHint')}</p>}
          {status === 'denied' && (
            <p className="error" role="alert">
              {t('cameraDenied')}
            </p>
          )}
          {status === 'unavailable' && (
            <p className="error" role="alert">
              {t('cameraUnavailable')}
            </p>
          )}
          {scanError && (
            <p className="error" role="alert">
              {t('scanInvalid')}
            </p>
          )}
          <div className="actions">
            {status === 'scanning' || status === 'starting' ? (
              <button type="button" className="secondary" onClick={stop}>
                {t('stopCamera')}
              </button>
            ) : (
              <button type="button" onClick={() => void start()}>
                {t('startCamera')}
              </button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => fileRef.current?.click()}
            >
              {t('chooseQrPhoto')}
            </button>
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => void onPickPhoto(event)}
            />
          </div>
          <form className="token-form" onSubmit={onSubmitToken}>
            <label>
              {t('tokenLabel')}
              <input
                name="token"
                autoComplete="off"
                spellCheck={false}
                placeholder={t('tokenPlaceholder')}
              />
            </label>
            <button type="submit">{t('useToken')}</button>
          </form>
        </>
      )}
      <p>
        <Link to={clientRoutes.welcome}>{t('backToWelcome')}</Link>
      </p>
    </ClientShell>
  );
}
