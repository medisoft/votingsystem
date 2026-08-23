import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n/I18nProvider';

/**
 * Unauthenticated sign-in form for administrators.
 */
export function Login() {
  const { t } = useI18n();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const login = useMutation({
    mutationFn: (credentials: {
      email: string;
      password: string;
      totp?: string;
    }) =>
      api('/api/v1/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['me'] }),
    onError: (value) => {
      if (value.message === 'TOTP_REQUIRED') {
        setTotpRequired(true);
        setError(t('totpRequired'));
        return;
      }
      setError(
        value.message === 'INVALID_CREDENTIALS'
          ? t('invalidCredentials')
          : value.message === 'TOTP_INVALID'
            ? t('totpInvalid')
            : t('loginFailed'),
      );
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const totp = String(data.get('totp') ?? '').trim();
    login.mutate({
      email: String(data.get('email')),
      password: String(data.get('password')),
      ...(totp ? { totp } : {}),
    });
  };
  return (
    <main>
      <section>
        <p className="eyebrow">{t('admin')}</p>
        <h1>{t('loginTitle')}</h1>
        <form onSubmit={submit}>
          <label>
            {t('email')}
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            {t('password')}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {totpRequired && (
            <label>
              {t('totpCode')}
              <input
                name="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                required
              />
            </label>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={login.isPending}>
            {login.isPending ? t('signingIn') : t('signIn')}
          </button>
        </form>
      </section>
    </main>
  );
}
