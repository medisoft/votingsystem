import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { App } from './App';

it('renders the stack placeholder through React Router', () => {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <App />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', { name: 'Voting client' }),
  ).toBeInTheDocument();
});
