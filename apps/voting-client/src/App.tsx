import { Navigate, Route, Routes } from 'react-router';
import { ActivateCredential } from './ActivateCredential';
import { I18nProvider } from './i18n/I18nProvider';
import { clientRoutes } from './routes';
import { Welcome } from './Welcome';

/**
 * Owner client routes: welcome, credential activation, and a catch-all.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path={clientRoutes.welcome} element={<Welcome />} />
      <Route path={clientRoutes.activate} element={<ActivateCredential />} />
      <Route
        path="*"
        element={<Navigate to={clientRoutes.welcome} replace />}
      />
    </Routes>
  );
}

/**
 * Voting client shell with locale support.
 */
export function App() {
  return (
    <I18nProvider>
      <AppRoutes />
    </I18nProvider>
  );
}
