import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

// Empty by default so browsers use the same hostname that served the UI.
// Vite proxies /api to the registration API during local/container development.
const apiUrl = import.meta.env.VITE_API_URL || '';
type Role = 'SYSTEM_ADMIN' | 'REGISTRATION_OPERATOR' | 'AUDITOR';
interface User {
  id: string;
  email: string;
  role: Role;
  status: string;
  createdAt: string;
}
type ScopeStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'ACTIVATION_OPEN'
  | 'VOTING_ACTIVE'
  | 'CLOSED'
  | 'ARCHIVED';
interface Scope {
  id: string;
  name: string;
  description: string | null;
  status: ScopeStatus;
  startsAt: string;
  endsAt: string;
  activationStartsAt: string;
  activationEndsAt: string;
  credentialExpiresAt: string;
  votingWeightsEnabled: boolean;
  issuerKeyVersion: string;
  version: number;
}
const nextStatus: Partial<Record<ScopeStatus, ScopeStatus>> = {
  DRAFT: 'REGISTRATION_OPEN',
  REGISTRATION_OPEN: 'ACTIVATION_OPEN',
  ACTIVATION_OPEN: 'VOTING_ACTIVE',
  VOTING_ACTIVE: 'CLOSED',
  CLOSED: 'ARCHIVED',
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(apiUrl + path, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!response.ok)
    throw new Error(
      (
        (await response.json().catch(() => ({ code: 'REQUEST_FAILED' }))) as {
          code?: string;
        }
      ).code ?? 'REQUEST_FAILED',
    );
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

function Login() {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const login = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api('/api/v1/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['me'] }),
    onError: (value) =>
      setError(
        value.message === 'INVALID_CREDENTIALS'
          ? 'Correo o contraseña incorrectos.'
          : 'No fue posible iniciar sesión.',
      ),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    login.mutate({
      email: String(data.get('email')),
      password: String(data.get('password')),
    });
  };
  return (
    <main>
      <section>
        <p className="eyebrow">Administración</p>
        <h1>Iniciar sesión</h1>
        <form onSubmit={submit}>
          <label>
            Correo electrónico
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={login.isPending}>
            {login.isPending ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ user }: { user: User }) {
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: User[] }>('/api/v1/admin/users'),
    enabled: user.role === 'SYSTEM_ADMIN',
  });
  const scopes = useQuery({
    queryKey: ['scopes'],
    queryFn: () => api<{ scopes: Scope[] }>('/api/v1/admin/scopes'),
  });
  const scopeMutation = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body: unknown;
      method?: string;
    }) => api(path, { method, body: JSON.stringify(body) }),
    onSuccess: () => {
      setMessage('Alcance actualizado.');
      void client.invalidateQueries({ queryKey: ['scopes'] });
    },
    onError: (error) =>
      setMessage('No fue posible guardar el alcance: ' + error.message),
  });
  const logout = useMutation({
    mutationFn: () => api('/api/v1/admin/auth/logout', { method: 'POST' }),
    onSuccess: () => client.setQueryData(['me'], null),
  });
  const create = useMutation({
    mutationFn: (body: { email: string; password: string; role: Role }) =>
      api('/api/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setMessage('Administrador creado.');
      void client.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) =>
      setMessage(
        error.message === 'EMAIL_EXISTS'
          ? 'Ese correo ya está registrado.'
          : 'No fue posible crear el usuario.',
      ),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const data = new FormData(event.currentTarget);
    create.mutate({
      email: String(data.get('email')),
      password: String(data.get('password')),
      role: String(data.get('role')) as Role,
    });
    event.currentTarget.reset();
  };
  const createScope = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const data = new FormData(event.currentTarget);
    scopeMutation.mutate({
      path: '/api/v1/admin/scopes',
      body: {
        name: String(data.get('name')),
        description: String(data.get('description')) || null,
        activationStartsAt: new Date(
          String(data.get('activationStartsAt')),
        ).toISOString(),
        activationEndsAt: new Date(
          String(data.get('activationEndsAt')),
        ).toISOString(),
        startsAt: new Date(String(data.get('startsAt'))).toISOString(),
        endsAt: new Date(String(data.get('endsAt'))).toISOString(),
        credentialExpiresAt: new Date(
          String(data.get('credentialExpiresAt')),
        ).toISOString(),
        votingWeightsEnabled: data.get('votingWeightsEnabled') === 'on',
        issuerKeyVersion: String(data.get('issuerKeyVersion')),
      },
    });
  };
  const renameScope = (scope: Scope) => {
    const name = window.prompt('Nuevo nombre del alcance', scope.name);
    if (name && name.trim() !== scope.name)
      scopeMutation.mutate({
        path: `/api/v1/admin/scopes/${scope.id}`,
        method: 'PATCH',
        body: { name: name.trim(), version: scope.version },
      });
  };
  return (
    <main>
      <section className="wide">
        <header>
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Panel de registro</h1>
            <p>
              {user.email} · {user.role}
            </p>
          </div>
          <button className="secondary" onClick={() => logout.mutate()}>
            Cerrar sesión
          </button>
        </header>
        <h2>Alcances de votación</h2>
        {scopes.isError && (
          <p role="alert">No fue posible cargar los alcances.</p>
        )}
        <ul>
          {scopes.data?.scopes.map((scope) => (
            <li key={scope.id}>
              <span>
                <strong>{scope.name}</strong>
                <br />
                {new Date(scope.startsAt).toLocaleString()} —{' '}
                {new Date(scope.endsAt).toLocaleString()}
              </span>
              <span>
                {scope.status} · v{scope.version}
                {user.role === 'SYSTEM_ADMIN' &&
                  (scope.status === 'DRAFT' ||
                    scope.status === 'REGISTRATION_OPEN') && (
                    <>
                      <br />
                      <button
                        className="small secondary"
                        onClick={() => renameScope(scope)}
                      >
                        Editar nombre
                      </button>
                    </>
                  )}
                {user.role === 'SYSTEM_ADMIN' && nextStatus[scope.status] && (
                  <>
                    <br />
                    <button
                      className="small"
                      onClick={() =>
                        scopeMutation.mutate({
                          path: `/api/v1/admin/scopes/${scope.id}/transition`,
                          body: {
                            status: nextStatus[scope.status],
                            version: scope.version,
                          },
                        })
                      }
                    >
                      Avanzar a {nextStatus[scope.status]}
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {user.role === 'SYSTEM_ADMIN' && (
          <>
            <h2>Crear alcance</h2>
            <form onSubmit={createScope}>
              <label>
                Nombre
                <input name="name" required />
              </label>
              <label>
                Descripción
                <input name="description" />
              </label>
              <label>
                Inicio de activación
                <small>
                  Desde cuándo los residentes pueden canjear su QR y obtener una
                  credencial.
                </small>
                <input
                  name="activationStartsAt"
                  type="datetime-local"
                  required
                />
              </label>
              <label>
                Fin de activación
                <small>
                  Último momento para activar una credencial. Puede coincidir
                  con la votación.
                </small>
                <input name="activationEndsAt" type="datetime-local" required />
              </label>
              <label>
                Inicio de votación
                <small>Desde cuándo el servidor acepta votos.</small>
                <input name="startsAt" type="datetime-local" required />
              </label>
              <label>
                Fin de votación
                <small>Después de este momento ya no se aceptan votos.</small>
                <input name="endsAt" type="datetime-local" required />
              </label>
              <label>
                Expiración de credencial
                <small>
                  Debe ser posterior al final de activación y de votación.
                </small>
                <input
                  name="credentialExpiresAt"
                  type="datetime-local"
                  required
                />
              </label>
              <label>
                Versión de clave emisora
                <input
                  name="issuerKeyVersion"
                  defaultValue="2026-01"
                  required
                />
              </label>
              <label className="check">
                <input name="votingWeightsEnabled" type="checkbox" />
                Usar diferentes pesos de voto según la unidad o el derecho de
                voto
              </label>
              <small>
                Déjalo desmarcado si cada unidad cuenta exactamente como un
                voto.
              </small>
              <button disabled={scopeMutation.isPending}>Crear alcance</button>
            </form>
          </>
        )}
        {user.role === 'SYSTEM_ADMIN' ? (
          <>
            <h2>Administradores</h2>
            <ul>
              {users.data?.users.map((item) => (
                <li key={item.id}>
                  <span>{item.email}</span>
                  <span>
                    {item.role} · {item.status}
                  </span>
                </li>
              ))}
            </ul>
            <h2>Crear administrador</h2>
            <form onSubmit={submit}>
              <label>
                Correo
                <input name="email" type="email" required />
              </label>
              <label>
                Contraseña temporal
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  required
                />
              </label>
              <label>
                Rol
                <select name="role">
                  <option value="REGISTRATION_OPERATOR">
                    Operador de registro
                  </option>
                  <option value="AUDITOR">Auditor</option>
                  <option value="SYSTEM_ADMIN">
                    Administrador del sistema
                  </option>
                </select>
              </label>
              {message && <p role="status">{message}</p>}
              <button disabled={create.isPending}>Crear usuario</button>
            </form>
          </>
        ) : (
          <p>
            Tu sesión está activa. Las funciones para este rol se añadirán en
            las siguientes etapas.
          </p>
        )}
      </section>
    </main>
  );
}

export function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: User }>('/api/v1/admin/me'),
    retry: false,
  });
  if (me.isPending)
    return (
      <main>
        <p>Comprobando sesión…</p>
      </main>
    );
  return me.data ? <Dashboard user={me.data.user} /> : <Login />;
}
