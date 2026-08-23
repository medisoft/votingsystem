import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { ActivationError, redeemActivation } from './activate-credential';
import { App } from './App';
import {
  createMemoryVault,
  setCredentialVault,
  toCredentialSummary,
  type StoredCredential,
} from './credential-vault';
import { LOCALE_STORAGE_KEY } from './i18n';
import type { InstallPromptEvent } from './install';
import { resetNativeQrDetectorCache } from './qr-detect';
import { useClientStore } from './store';

vi.mock('./activate-credential', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./activate-credential')>();
  return {
    ...actual,
    redeemActivation: vi.fn(),
  };
});

const redeemActivationMock = vi.mocked(redeemActivation);

const SAMPLE_TOKEN = 'Aa1_-'.repeat(8) + 'xyz';
const SCOPE_ID = '22222222-2222-4222-8222-222222222222';

function sampleStoredCredential(): StoredCredential {
  return {
    privateKey: {} as CryptoKey,
    publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    publicKeyAlgorithm: 'Ed25519',
    credentialId: '11111111-1111-4111-8111-111111111111',
    publicMetadata: {
      schemaVersion: 2,
      protocol: 'RSAPBSSA-SHA384-PSS-Randomized',
      scopeId: SCOPE_ID,
      weight: '1.0000',
      credentialVersion: 1,
      expiresAt: '2026-12-31T23:59:59.000Z',
      issuer: 'condominium-registration-service',
      keyVersion: 'test-2026-01',
    },
    preparedMessage: 'prepared',
    signature: 'signature',
    storedAt: '2026-08-23T00:00:00.000Z',
  };
}

async function seedStoredCredential() {
  const stored = sampleStoredCredential();
  const vault = createMemoryVault();
  await vault.put(stored);
  setCredentialVault(vault);
  useClientStore.getState().setCredential(toCredentialSummary(stored));
}

function stubScopeStatus(status = 'VOTING_ACTIVE') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scopeId: SCOPE_ID,
        status,
        activationStartsAt: '2026-08-01T00:00:00.000Z',
        activationEndsAt: '2026-08-20T00:00:00.000Z',
        startsAt: '2026-08-01T00:00:00.000Z',
        endsAt: '2026-12-31T00:00:00.000Z',
        credentialExpiresAt: '2026-12-31T23:59:59.000Z',
        acceptsActivation: false,
        issuerKeyVersion: 'test-2026-01',
      }),
    }),
  );
}

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <App />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_STORAGE_KEY);
  useClientStore.getState().setActivationToken(null);
  useClientStore.getState().setCredential(null);
  setCredentialVault(createMemoryVault());
  resetNativeQrDetectorCache();
  redeemActivationMock.mockReset();
  vi.unstubAllGlobals();
});

it('shows the welcome screen with project name and activation', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  renderApp();
  expect(
    screen.getByRole('heading', { name: 'Voting system' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Activate an anonymous voting credential/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Activate credential' }),
  ).toBeInTheDocument();
});

it('opens the QR activation screen from the welcome button', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  renderApp();
  fireEvent.click(screen.getByRole('button', { name: 'Activate credential' }));
  expect(
    screen.getByRole('button', { name: 'Start camera' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Back to welcome' }));
  expect(
    screen.getByRole('button', { name: 'Activate credential' }),
  ).toBeInTheDocument();
});

it('accepts a pasted activation URL and keeps only the token in memory', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  renderApp('/activate');
  fireEvent.change(screen.getByLabelText('Activation token'), {
    target: {
      value: `https://vote.example.com/activate?token=${SAMPLE_TOKEN}`,
    },
  });
  fireEvent.submit(screen.getByLabelText('Activation token').closest('form')!);
  expect(
    screen.getByText(
      `Activation code received (${SAMPLE_TOKEN.slice(0, 8)}…).`,
    ),
  ).toBeInTheDocument();
  expect(useClientStore.getState().activationToken).toBe(SAMPLE_TOKEN);
  expect(window.localStorage.getItem('activationToken')).toBeNull();
});

it('rejects an invalid pasted value', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  renderApp('/activate');
  fireEvent.change(screen.getByLabelText('Activation token'), {
    target: { value: 'not a token' },
  });
  fireEvent.submit(screen.getByLabelText('Activation token').closest('form')!);
  expect(screen.getByText(/not a valid activation token/)).toBeInTheDocument();
});

it('reads a token query parameter then strips it from the URL', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  renderApp(`/activate?token=${SAMPLE_TOKEN}`);
  expect(
    screen.getByText(
      `Activation code received (${SAMPLE_TOKEN.slice(0, 8)}…).`,
    ),
  ).toBeInTheDocument();
  expect(useClientStore.getState().activationToken).toBe(SAMPLE_TOKEN);
});

it('starts the camera and reports a denied permission', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
        ),
    },
  });
  renderApp('/activate');
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  expect(
    await screen.findByText(/Camera permission was denied/),
  ).toBeInTheDocument();
});

it('accepts a camera QR that contains an activation URL', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      detect = vi.fn().mockResolvedValue([
        {
          rawValue: `https://vote.example.com/activate?token=${SAMPLE_TOKEN}`,
        },
      ]);
    },
  );
  resetNativeQrDetectorCache();
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  });
  renderApp('/activate');
  fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
  expect(
    await screen.findByText(
      `Activation code received (${SAMPLE_TOKEN.slice(0, 8)}…).`,
    ),
  ).toBeInTheDocument();
});

it('clears the scanned token when scanning again', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  useClientStore.getState().setActivationToken(SAMPLE_TOKEN);
  renderApp('/activate');
  fireEvent.click(screen.getByRole('button', { name: 'Scan again' }));
  expect(
    screen.getByRole('button', { name: 'Start camera' }),
  ).toBeInTheDocument();
  expect(useClientStore.getState().activationToken).toBeNull();
});

it('redeems the token and stores the credential on this device', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  useClientStore.getState().setActivationToken(SAMPLE_TOKEN);
  redeemActivationMock.mockResolvedValue({
    privateKey: {} as CryptoKey,
    publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    publicKeyAlgorithm: 'Ed25519',
    credentialId: '11111111-1111-4111-8111-111111111111',
    publicMetadata: {
      schemaVersion: 2,
      protocol: 'RSAPBSSA-SHA384-PSS-Randomized',
      scopeId: '22222222-2222-4222-8222-222222222222',
      weight: '1.0000',
      credentialVersion: 1,
      expiresAt: '2026-08-31T23:59:59.000Z',
      issuer: 'condominium-registration-service',
      keyVersion: 'test-2026-01',
    },
    preparedMessage: 'prepared',
    signature: 'signature',
    storedAt: '2026-08-23T00:00:00.000Z',
  });
  renderApp('/activate');
  fireEvent.click(
    screen.getByRole('button', { name: 'Activate on this device' }),
  );
  expect(
    await screen.findByText(/anonymous voting credential is stored/),
  ).toBeInTheDocument();
  expect(screen.getByText(/Valid until/)).toBeInTheDocument();
  expect(useClientStore.getState().activationToken).toBeNull();
  expect(useClientStore.getState().credential?.expiresAt).toBe(
    '2026-08-31T23:59:59.000Z',
  );
  expect(redeemActivationMock).toHaveBeenCalledWith(SAMPLE_TOKEN);
  stubScopeStatus();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to home' }));
  expect(
    await screen.findByRole('heading', { name: 'Home' }),
  ).toBeInTheDocument();
});

it('shows an expired-token error from the registration service', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  useClientStore.getState().setActivationToken(SAMPLE_TOKEN);
  redeemActivationMock.mockRejectedValue(
    new ActivationError('ACTIVATION_TOKEN_EXPIRED'),
  );
  renderApp('/activate');
  fireEvent.click(
    screen.getByRole('button', { name: 'Activate on this device' }),
  );
  expect(
    await screen.findByText(/activation code has expired/),
  ).toBeInTheDocument();
  expect(useClientStore.getState().activationToken).toBe(SAMPLE_TOKEN);
});

it('redirects unknown paths to the welcome screen', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  renderApp('/missing');
  expect(
    screen.getByRole('heading', { name: 'Voting system' }),
  ).toBeInTheDocument();
});

it('switches the welcome language', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  renderApp();
  fireEvent.change(screen.getByLabelText('Language'), {
    target: { value: 'es' },
  });
  expect(
    screen.getByRole('button', { name: 'Activar credencial' }),
  ).toBeInTheDocument();
});

it('offers the captured browser install prompt', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  renderApp();
  expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
  const prompt = vi.fn(async () => undefined);
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as InstallPromptEvent;
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  window.dispatchEvent(event);
  fireEvent.click(await screen.findByRole('button', { name: 'Install app' }));
  expect(prompt).toHaveBeenCalledOnce();
});

it('shows iOS install instructions when the browser has no prompt', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.stubGlobal('navigator', {
    ...navigator,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    languages: ['en-US'],
    platform: 'iPhone',
    maxTouchPoints: 5,
  });
  renderApp();
  expect(
    screen.getByText(/tap Share and then Add to Home Screen/),
  ).toBeInTheDocument();
});

it('opens home after a stored credential and lists status fields', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  await seedStoredCredential();
  stubScopeStatus();
  renderApp('/home');
  expect(await screen.findByText('Voting is open')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
  expect(screen.getByText('Current voting status')).toBeInTheDocument();
  expect(screen.getByText('Active proposals')).toBeInTheDocument();
  expect(screen.getByText('0')).toBeInTheDocument();
  expect(screen.getByText('Last synchronization')).toBeInTheDocument();
  expect(screen.getByText('Connection status')).toBeInTheDocument();
  expect(screen.getByText('Online')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'View proposals' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'My votes' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
});

it('sends a stored credential from welcome to home', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  await seedStoredCredential();
  stubScopeStatus();
  renderApp();
  expect(
    await screen.findByRole('heading', { name: 'Home' }),
  ).toBeInTheDocument();
});

it('sends home back to welcome when no credential is stored', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  renderApp('/home');
  expect(
    await screen.findByRole('button', { name: 'Activate credential' }),
  ).toBeInTheDocument();
});

it('opens the proposal placeholder from home', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  await seedStoredCredential();
  stubScopeStatus();
  renderApp('/home');
  fireEvent.click(
    await screen.findByRole('button', { name: 'View proposals' }),
  );
  expect(
    screen.getByText('The list of proposals will appear here.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Back to home' }));
  expect(
    await screen.findByRole('heading', { name: 'Home' }),
  ).toBeInTheDocument();
});

it('reports offline connection on the home screen', async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  await seedStoredCredential();
  vi.stubGlobal('navigator', { ...navigator, onLine: false });
  renderApp('/home');
  expect(await screen.findByText('Offline')).toBeInTheDocument();
  expect(screen.getByText('Unknown')).toBeInTheDocument();
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
  expect(screen.getByText('Not yet synchronized')).toBeInTheDocument();
});

it('hides install chrome when already running standalone', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
  renderApp();
  expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
  expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
});
