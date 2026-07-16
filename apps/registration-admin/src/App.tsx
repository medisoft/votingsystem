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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl + path, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
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
