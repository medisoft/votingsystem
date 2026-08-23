import { Route, Routes } from 'react-router';

/**
 * Placeholder shell so React Router is wired before feature screens exist.
 */
export function App() {
  return (
    <Routes>
      <Route
        path="*"
        element={
          <main>
            <h1>Voting client</h1>
            <p>
              The application stack is installed. Screens will follow in later
              stages.
            </p>
          </main>
        }
      />
    </Routes>
  );
}
