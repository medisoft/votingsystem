import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  blindCommitment,
  bytesToBase64url,
  unblindSignature,
  verifyBlindCredential,
} from '../src/blind-rsa.js';
import {
  BLIND_CREDENTIAL_PROTOCOL,
  CREDENTIAL_PUBLIC_KEY_ALGORITHM,
  generateClientNonce,
  type CredentialCommitment,
  type PublicMetadata,
} from '../src/credentials.js';
import { importIssuerPublicJwk } from '../src/issuer-keys.js';

export interface BlindActivationResult {
  context: Awaited<ReturnType<FastifyInstance['inject']>>;
  issued: Awaited<ReturnType<FastifyInstance['inject']>>;
  commitment: CredentialCommitment;
  publicMetadata: PublicMetadata;
  preparedMsg: Uint8Array;
  inv: Uint8Array;
  blindedMsg: Uint8Array;
  signature: Uint8Array | null;
  verified: boolean;
}

/**
 * Completes the client half of blind issuance against a running test app.
 *
 * @param app - Fastify test application.
 * @param rawToken - Unused activation token.
 * @param publicKey - Canonical base64url Ed25519 voter public key.
 * @param remoteAddress - Address used for rate-limit isolation.
 * @returns Context and activate responses plus unblinded verification state.
 */
export async function redeemBlindActivation(
  app: FastifyInstance,
  rawToken: string,
  publicKey: string,
  remoteAddress = '127.0.0.30',
): Promise<BlindActivationResult> {
  const keys = await app.inject({
    method: 'GET',
    url: '/api/v1/public/issuer-keys',
  });
  const published = keys.json().keys[0]?.publicKey as JsonWebKey | undefined;
  if (!published) throw new Error('Issuer public key missing');
  const issuerPublicKey = await importIssuerPublicJwk(published);
  const context = await app.inject({
    method: 'POST',
    url: '/api/v1/public/activation-context',
    remoteAddress,
    payload: { activationToken: rawToken },
  });
  if (context.statusCode !== 200) {
    return {
      context,
      issued: context,
      commitment: {
        credentialId: randomUUID(),
        publicKey,
        publicKeyAlgorithm: CREDENTIAL_PUBLIC_KEY_ALGORITHM,
      },
      publicMetadata: {
        schemaVersion: 2,
        protocol: BLIND_CREDENTIAL_PROTOCOL,
        scopeId: '',
        weight: '0.0000',
        credentialVersion: 1,
        expiresAt: new Date().toISOString(),
        issuer: '',
        keyVersion: '',
      },
      preparedMsg: new Uint8Array(),
      inv: new Uint8Array(),
      blindedMsg: new Uint8Array(),
      signature: null,
      verified: false,
    };
  }
  const publicMetadata = context.json().publicMetadata as PublicMetadata;
  const commitment: CredentialCommitment = {
    credentialId: randomUUID(),
    publicKey,
    publicKeyAlgorithm: CREDENTIAL_PUBLIC_KEY_ALGORITHM,
  };
  const blinded = await blindCommitment(
    issuerPublicKey,
    commitment,
    publicMetadata,
  );
  const issued = await app.inject({
    method: 'POST',
    url: '/api/v1/public/activate',
    remoteAddress,
    payload: {
      activationToken: rawToken,
      protocol: BLIND_CREDENTIAL_PROTOCOL,
      blindedMessage: bytesToBase64url(blinded.blindedMsg),
      publicMetadata,
      clientNonce: generateClientNonce(),
    },
  });
  let signature: Uint8Array | null = null;
  let verified = false;
  const envelope = issued.json().credential as
    { publicMetadata: PublicMetadata; blindedSignature: string } | undefined;
  if ((issued.statusCode === 201 || issued.statusCode === 200) && envelope) {
    signature = await unblindSignature(
      issuerPublicKey,
      blinded.preparedMsg,
      envelope.publicMetadata,
      Buffer.from(envelope.blindedSignature, 'base64url'),
      blinded.inv,
    );
    verified = await verifyBlindCredential(
      issuerPublicKey,
      signature,
      blinded.preparedMsg,
      envelope.publicMetadata,
    );
  }
  return {
    context,
    issued,
    commitment,
    publicMetadata,
    preparedMsg: blinded.preparedMsg,
    inv: blinded.inv,
    blindedMsg: blinded.blindedMsg,
    signature,
    verified,
  };
}
