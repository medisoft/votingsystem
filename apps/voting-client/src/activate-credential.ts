import { base64urlToBytes, bytesToBase64url } from './base64url';
import {
  blindCommitment,
  importIssuerPublicJwk,
  unblindAndVerify,
} from './blind-credential';
import {
  BLIND_CREDENTIAL_PROTOCOL,
  CREDENTIAL_PUBLIC_KEY_ALGORITHM,
  generateClientNonce,
} from './credential-protocol';
import {
  type CredentialVault,
  type StoredCredential,
  getCredentialVault,
} from './credential-vault';
import {
  ActivationApiError,
  getActivationContext,
  getIssuerKeys,
  postActivate,
} from './registration-public-api';
import { generateVoterKeyPair } from './voter-keys';

export class ActivationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ActivationError';
  }
}

/** Last unblinded credential that IndexedDB refused, so a retry can store it. */
let pendingStore: StoredCredential | null = null;

/**
 * Clears in-memory retry state. Used by tests.
 */
export function resetPendingCredential(): void {
  pendingStore = null;
}

export interface RedeemPorts {
  vault?: CredentialVault;
  generateVoterKeyPair?: typeof generateVoterKeyPair;
  randomUUID?: () => string;
  generateClientNonce?: typeof generateClientNonce;
  getIssuerKeys?: typeof getIssuerKeys;
  getActivationContext?: typeof getActivationContext;
  postActivate?: typeof postActivate;
  importIssuerPublicJwk?: typeof importIssuerPublicJwk;
  blindCommitment?: typeof blindCommitment;
  unblindAndVerify?: typeof unblindAndVerify;
}

/**
 * Generates a local key pair, blinds the commitment, redeems the token, and
 * stores the unblinded credential. The private key is never sent.
 *
 * @param activationToken - One-time token from the QR scanner.
 * @param ports - Optional substitutes used by tests.
 * @returns Stored anonymous credential including the local private key.
 */
export async function redeemActivation(
  activationToken: string,
  ports: RedeemPorts = {},
): Promise<StoredCredential> {
  const vault = ports.vault ?? getCredentialVault();
  const existing = await vault.get();
  if (existing) {
    pendingStore = null;
    return existing;
  }
  if (pendingStore) {
    try {
      await vault.put(pendingStore);
      const saved = pendingStore;
      pendingStore = null;
      return saved;
    } catch {
      throw new ActivationError('STORAGE');
    }
  }

  const generateKeys = ports.generateVoterKeyPair ?? generateVoterKeyPair;
  const uuid = ports.randomUUID ?? (() => crypto.randomUUID());
  const nonce = ports.generateClientNonce ?? generateClientNonce;
  const loadKeys = ports.getIssuerKeys ?? getIssuerKeys;
  const loadContext = ports.getActivationContext ?? getActivationContext;
  const activate = ports.postActivate ?? postActivate;
  const importJwk = ports.importIssuerPublicJwk ?? importIssuerPublicJwk;
  const blind = ports.blindCommitment ?? blindCommitment;
  const unblind = ports.unblindAndVerify ?? unblindAndVerify;

  let voter;
  try {
    voter = await generateKeys();
  } catch {
    throw new ActivationError('CRYPTO');
  }

  let issuerKey: CryptoKey;
  let publicMetadata;
  try {
    const issuer = await loadKeys();
    issuerKey = await importJwk(issuer.publicKey);
    const context = await loadContext(activationToken);
    publicMetadata = context.publicMetadata;
  } catch (error) {
    if (error instanceof ActivationApiError) {
      throw new ActivationError(error.code);
    }
    throw new ActivationError('NETWORK');
  }

  const commitment = {
    credentialId: uuid(),
    publicKey: voter.publicKey,
    publicKeyAlgorithm: CREDENTIAL_PUBLIC_KEY_ALGORITHM,
  };

  let blinded;
  try {
    blinded = await blind(issuerKey, commitment, publicMetadata);
  } catch {
    throw new ActivationError('CRYPTO');
  }

  let envelope;
  try {
    envelope = await activate({
      activationToken,
      protocol: BLIND_CREDENTIAL_PROTOCOL,
      blindedMessage: bytesToBase64url(blinded.blindedMsg),
      publicMetadata,
      clientNonce: nonce(),
    });
  } catch (error) {
    if (error instanceof ActivationApiError) {
      throw new ActivationError(error.code);
    }
    throw new ActivationError('NETWORK');
  }

  const blindedSignature = base64urlToBytes(envelope.blindedSignature);
  if (!blindedSignature) throw new ActivationError('UNBLIND_FAILED');

  let signature: Uint8Array;
  try {
    signature = await unblind(
      issuerKey,
      blinded.preparedMsg,
      envelope.publicMetadata,
      blindedSignature,
      blinded.inv,
    );
  } catch {
    throw new ActivationError('UNBLIND_FAILED');
  }

  const stored: StoredCredential = {
    privateKey: voter.privateKey,
    publicKey: voter.publicKey,
    publicKeyAlgorithm: CREDENTIAL_PUBLIC_KEY_ALGORITHM,
    credentialId: commitment.credentialId,
    publicMetadata: envelope.publicMetadata,
    preparedMessage: bytesToBase64url(blinded.preparedMsg),
    signature: bytesToBase64url(signature),
    storedAt: new Date().toISOString(),
  };
  try {
    await vault.put(stored);
  } catch {
    pendingStore = stored;
    throw new ActivationError('STORAGE');
  }
  return stored;
}

/**
 * Maps an activation failure code to an i18n message key.
 *
 * @param code - API or local error code.
 * @returns Message key for the activation screen.
 */
export function activationErrorMessageKey(
  code: string,
):
  | 'activationTokenNotFound'
  | 'activationTokenExpired'
  | 'activationTokenRevoked'
  | 'activationTokenUsed'
  | 'activationNotEligible'
  | 'activationWindow'
  | 'activationUnblindFailed'
  | 'activationStorageFailed'
  | 'activationNetwork'
  | 'activationFailed' {
  switch (code) {
    case 'ACTIVATION_TOKEN_NOT_FOUND':
      return 'activationTokenNotFound';
    case 'ACTIVATION_TOKEN_EXPIRED':
      return 'activationTokenExpired';
    case 'ACTIVATION_TOKEN_REVOKED':
      return 'activationTokenRevoked';
    case 'ACTIVATION_TOKEN_ALREADY_REDEEMED':
      return 'activationTokenUsed';
    case 'REGISTRATION_NOT_ELIGIBLE':
    case 'CREDENTIAL_ALREADY_ISSUED':
      return 'activationNotEligible';
    case 'ACTIVATION_SCOPE_NOT_OPEN':
    case 'ACTIVATION_WINDOW_NOT_STARTED':
    case 'ACTIVATION_WINDOW_ENDED':
      return 'activationWindow';
    case 'UNBLIND_FAILED':
      return 'activationUnblindFailed';
    case 'STORAGE':
      return 'activationStorageFailed';
    case 'NETWORK':
      return 'activationNetwork';
    case 'CRYPTO':
      return 'activationFailed';
    default:
      return 'activationFailed';
  }
}
