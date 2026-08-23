import { Navigate, Route, Routes } from 'react-router';
import { ActivateCredential } from './ActivateCredential';
import { Home } from './Home';
import { I18nProvider } from './i18n/I18nProvider';
import { PlaceholderScreen } from './PlaceholderScreen';
import { clientRoutes } from './routes';
import { Welcome } from './Welcome';

/**
 * Owner client routes: welcome, activation, home, and later-stage screens.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path={clientRoutes.welcome} element={<Welcome />} />
      <Route path={clientRoutes.activate} element={<ActivateCredential />} />
      <Route path={clientRoutes.home} element={<Home />} />
      <Route
        path={clientRoutes.proposals}
        element={
          <PlaceholderScreen
            titleKey="proposalsTitle"
            bodyKey="proposalsPlaceholder"
          />
        }
      />
      <Route
        path={clientRoutes.votes}
        element={
          <PlaceholderScreen titleKey="votesTitle" bodyKey="votesPlaceholder" />
        }
      />
      <Route
        path={clientRoutes.settings}
        element={
          <PlaceholderScreen
            titleKey="settingsTitle"
            bodyKey="settingsPlaceholder"
          />
        }
      />
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
