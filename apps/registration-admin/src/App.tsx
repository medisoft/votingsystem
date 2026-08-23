import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router';
import { AdminLayout } from './AdminLayout';
import { AdminWorkspace } from './AdminWorkspace';
import { api } from './api';
import { I18nProvider, useI18n } from './i18n/I18nProvider';
import { Login } from './Login';
import type { User } from './types';

/**
 * Session-aware routes for the administrative interface.
 */
function AppRoutes() {
  const { t } = useI18n();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: User }>('/api/v1/admin/me'),
    retry: false,
  });
  if (me.isPending)
    return (
      <main>
        <p>{t('checkingSession')}</p>
      </main>
    );
  const user = me.data?.user;
  if (!user)
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AdminLayout user={user} />}>
        <Route path="/" element={<AdminWorkspace user={user} view="home" />} />
        <Route
          path="/account"
          element={<AdminWorkspace user={user} view="account" />}
        />
        <Route
          path="/registrations"
          element={<AdminWorkspace user={user} view="registrations" />}
        />
        <Route
          path="/registrations/:id"
          element={<AdminWorkspace user={user} view="registrations" />}
        />
        <Route
          path="/import"
          element={<AdminWorkspace user={user} view="import" />}
        />
        <Route
          path="/scopes"
          element={<AdminWorkspace user={user} view="scopes" />}
        />
        <Route
          path="/audit"
          element={<AdminWorkspace user={user} view="audit" />}
        />
        <Route
          path="/administrators"
          element={<AdminWorkspace user={user} view="administrators" />}
        />
      </Route>
    </Routes>
  );
}

/**
 * Administrative application shell.
 */
export function App() {
  return (
    <I18nProvider>
      <AppRoutes />
    </I18nProvider>
  );
}
