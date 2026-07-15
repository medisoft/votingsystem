import { useQuery } from '@tanstack/react-query';
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
async function health(): Promise<{ status: string }> {
  const response = await fetch(apiUrl + '/health/live');
  if (!response.ok) throw new Error('unavailable');
  return response.json() as Promise<{ status: string }>;
}
export function App() {
  const query = useQuery({
    queryKey: ['health'],
    queryFn: health,
    retry: false,
  });
  const status = query.isPending
    ? 'Comprobando…'
    : query.isSuccess
      ? 'Conectada'
      : 'No disponible';
  return (
    <main>
      <section>
        <p className="eyebrow">Administración</p>
        <h1>Registro y credenciales</h1>
        <p>
          La infraestructura inicial está lista. La autenticación y la gestión
          de registros se implementarán en las siguientes etapas.
        </p>
        <dl>
          <dt>API de registro</dt>
          <dd>{status}</dd>
        </dl>
      </section>
    </main>
  );
}
