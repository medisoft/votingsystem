import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ActivationError,
  activationErrorMessageKey,
  redeemActivation,
} from './activate-credential';
import { ClientShell } from './ClientShell';
import { getCredentialVault, toCredentialSummary } from './credential-vault';
import { useI18n } from './i18n/I18nProvider';
import { activationTokenPrefix, parseActivationQr } from './parseActivationQr';
import { detectQrFromSource } from './qr-detect';
import { clientRoutes } from './routes';
import { useClientStore } from './store';
import { useQrScanner } from './useQrScanner';

/**
 * Activation screen: scan a QR, generate a local key pair, redeem the token
 * with a blinded commitment, and store the anonymous credential on device.
 */
export function ActivateCredential() {
  const { locale, t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scanError, setScanError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activationToken = useClientStore((state) => state.activationToken);
  const setActivationToken = useClientStore(
    (state) => state.setActivationToken,
  );
  const credential = useClientStore((state) => state.credential);
  const setCredential = useClientStore((state) => state.setCredential);
  const { videoRef, status, lastRaw, start, stop, acceptRaw, clearLast } =
    useQrScanner();

  useEffect(() => {
    void getCredentialVault()
      .get()
      .then((stored) => {
        if (!stored) return;
        setCredential(toCredentialSummary(stored));
        setActivationToken(null);
      })
      .catch(() => undefined);
  }, [setActivationToken, setCredential]);

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
    setActivationError(null);
    clearLast();
  }, [setActivationToken, clearLast]);

  const onActivate = useCallback(async () => {
    if (!activationToken || busy) return;
    setBusy(true);
    setActivationError(null);
    try {
      const stored = await redeemActivation(activationToken);
      setCredential(toCredentialSummary(stored));
      setActivationToken(null);
    } catch (error) {
      const code =
        error instanceof ActivationError ? error.code : 'REQUEST_FAILED';
      setActivationError(code);
    } finally {
      setBusy(false);
    }
  }, [activationToken, busy, setActivationToken, setCredential]);

  const showViewport = status === 'starting' || status === 'scanning';
  const expiresLabel = credential
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en' : 'es', {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(new Date(credential.expiresAt))
    : '';

  return (
    <ClientShell title={t('activateTitle')}>
      {credential ? (
        <>
          <p className="success" role="status">
            {t('activationSuccess')}
          </p>
          <p>{t('activationExpires', { date: expiresLabel })}</p>
        </>
      ) : activationToken ? (
        <>
          <p className="success" role="status">
            {t('scanSuccess', {
              prefix: activationTokenPrefix(activationToken),
            })}
          </p>
          {activationError && (
            <p className="error" role="alert">
              {t(activationErrorMessageKey(activationError))}
            </p>
          )}
          {busy && <p role="status">{t('activating')}</p>}
          <div className="actions">
            <button
              type="button"
              onClick={() => void onActivate()}
              disabled={busy}
            >
              {t('activateOnDevice')}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={scanAgain}
              disabled={busy}
            >
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
