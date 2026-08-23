import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { LOCALE_STORAGE_KEY } from './i18n';
import type { InstallPromptEvent } from './install';

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

it('opens the activation placeholder from the welcome button', () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  renderApp();
  fireEvent.click(screen.getByRole('button', { name: 'Activate credential' }));
  expect(
    screen.getByText(/Camera scanning will be available/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Back to welcome' }));
  expect(
    screen.getByRole('button', { name: 'Activate credential' }),
  ).toBeInTheDocument();
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
