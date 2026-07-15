import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { App } from './App';
it('renders the administration shell', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole('heading', { name: 'Registro y credenciales' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('Conectada')).toBeInTheDocument();
});
