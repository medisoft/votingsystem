import {
  BLIND_CREDENTIAL_PROTOCOL,
  type PublicMetadata,
} from './credential-protocol';

const apiUrl = import.meta.env.VITE_API_URL || '';

export class ActivationApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ActivationApiError';
  }
}

export interface IssuerKeysResponse {
  keys: Array<{
    keyVersion: string;
    protocol: string;
    publicKey: JsonWebKey;
  }>;
}

export interface ActivationContextResponse {
  protocol: string;
  publicMetadata: PublicMetadata;
  keyVersion: string;
  blindedMessageBytes: number;
}

export interface ActivateRequest {
  activationToken: string;
  protocol: typeof BLIND_CREDENTIAL_PROTOCOL;
  blindedMessage: string;
  publicMetadata: PublicMetadata;
  clientNonce: string;
}

export interface IssuanceEnvelope {
  protocol: string;
  publicMetadata: PublicMetadata;
  blindedSignature: string;
  keyVersion: string;
}

/**
 * Same-origin JSON request to the registration service public API.
 *
 * @param path - Path beginning with `/api/v1/public/`.
 * @param init - Optional fetch init. JSON content-type is set when a body is present.
 */
async function publicApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(apiUrl + path, {
      ...init,
      credentials: 'omit',
      headers,
    });
  } catch {
    throw new ActivationApiError('NETWORK', 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      code: 'REQUEST_FAILED',
    }))) as { code?: string };
    throw new ActivationApiError(
      body.code ?? 'REQUEST_FAILED',
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

/**
 * Loads the current issuer public JWK used to blind the commitment.
 *
 * @returns First published issuer key.
 */
export async function getIssuerKeys(): Promise<IssuerKeysResponse['keys'][0]> {
  const body = await publicApi<IssuerKeysResponse>(
    '/api/v1/public/issuer-keys',
  );
  const key = body.keys[0];
  if (!key?.publicKey) throw new ActivationApiError('ISSUER_KEY_MISSING', 500);
  return key;
}

/**
 * Fetches issuer-chosen public metadata for this activation token.
 *
 * @param activationToken - Opaque one-time token from the QR code.
 * @returns Protocol metadata the client must echo when blinding.
 */
export async function getActivationContext(
  activationToken: string,
): Promise<ActivationContextResponse> {
  return publicApi<ActivationContextResponse>(
    '/api/v1/public/activation-context',
    {
      method: 'POST',
      body: JSON.stringify({ activationToken }),
    },
  );
}

/**
 * Submits a blinded commitment. The voter public key is not in this body.
 *
 * @param request - Blinded representative plus echoed public metadata.
 * @returns Blinded signature envelope.
 */
export async function postActivate(
  request: ActivateRequest,
): Promise<IssuanceEnvelope> {
  const body = await publicApi<{ credential: IssuanceEnvelope }>(
    '/api/v1/public/activate',
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
  );
  if (!body.credential?.blindedSignature) {
    throw new ActivationApiError('INVALID_ACTIVATION_RESPONSE', 500);
  }
  return body.credential;
}
