# Blind credential prototype

**Status: experimental. Not production-ready.**

Stage 11 replaces direct signing of a visible voter public key with a
partially-blind RSA issuance flow. The registration service authenticates an
activation token and signs a blinded commitment. After the client unblinds,
stored issuer data cannot be matched to the final credential.

## Library

The API uses [@cloudflare/blindrsa-ts](https://www.npmjs.com/package/@cloudflare/blindrsa-ts)
0.4.6 (Apache-2.0, Node >= 24). It implements:

- [RFC 9474](https://www.rfc-editor.org/rfc/rfc9474.html) RSA Blind Signatures
- [draft-amjad-cfrg-partially-blind-rsa-02](https://datatracker.ietf.org/doc/html/draft-amjad-cfrg-partially-blind-rsa-02)

Node.js 24 has first-class RSA-PSS, but not blinding. A custom modular
exponentiation protocol would duplicate a maintained library, so this project
uses Cloudflare's suite.

Selected variant: `RSAPBSSA-SHA384-PSS-Randomized`.

Issuer keys MUST be generated with safe primes (Sophie Germain primes). Use:

```bash
npm run issuer:generate -w @voting/registration-api
```

Do not use `openssl genrsa` or Node `generateKeyPairSync('rsa')`. Those keys
are not valid for partially-blind RSA.

## Protocol

```text
Client                                         Registration API
------                                         ----------------
GET /api/v1/public/issuer-keys
        <--------- RSA-PSS public JWK

POST /api/v1/public/activation-context
  { activationToken }
        <--------- publicMetadata (info)

prepared = Prepare(canonicalCommitment)
blinded, inv = Blind(pk, prepared, info)
        (inv and prepared stay on the client)

POST /api/v1/public/activate
  { activationToken, protocol, blindedMessage, publicMetadata, clientNonce }
        <--------- blindedSignature, publicMetadata

sig = Finalize(pk, prepared, info, blindedSignature, inv)
verify(pk, sig, prepared, info) == true
```

### Public metadata (`info`)

Canonical JSON, fixed field order, UTF-8:

```json
{
  "schemaVersion": 2,
  "protocol": "RSAPBSSA-SHA384-PSS-Randomized",
  "scopeId": "22222222-2222-4222-8222-222222222222",
  "weight": "1.0000",
  "credentialVersion": 1,
  "expiresAt": "2026-08-31T23:59:59.000Z",
  "issuer": "condominium-registration-service",
  "keyVersion": "test-2026-01"
}
```

The issuer chooses these fields. The client must echo the same JSON when
blinding. `issuedAt` is omitted so a unique timestamp cannot identify the
issuance row.

### Hidden commitment (`msg`)

Canonical JSON, prepared then blinded. The issuer never receives this:

```json
{
  "credentialId": "11111111-1111-4111-8111-111111111111",
  "publicKey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "publicKeyAlgorithm": "Ed25519"
}
```

`publicKey` is a 32-byte Ed25519 key encoded as canonical base64url. The
corresponding private key is never sent.

## Storage

`IssuedCredential` stores:

- registration and scope (entitlement control)
- protocol, public metadata, blinded-message SHA-256, blinded signature
- version, weight, status, expiry

It does not store:

- voter public key or fingerprint
- credential UUID
- unblinded signature or prepared message

Replay uses the hash of the blinded representative. That hash does not equal
the hash of the unblinded signature or of the prepared message.

## Revocation

Administrators revoke and reissue **issuance records**. Public
`issuance-status` and the signed revocation list use internal issuance ids.
Those ids are not in the unblinded credential, so a later ballot presentation
cannot be looked up in the registration database.

Unblinded signatures remain mathematically valid until `expiresAt` or until
the issuer key / `ISSUER_KEY_VERSION` is rotated.

## Test vectors

Automated tests in `apps/registration-api/test/credentials.test.ts` freeze the
canonical JSON above and prove:

- blinding, issuer signing, unblinding, and verification succeed
- a different `weight` in `info` fails verification
- the stored blinded-message hash is not the unblinded signature
- the blinded bytes do not contain the voter public key

RFC 9474 Appendix A vectors are covered by `@cloudflare/blindrsa-ts`. This
project does not re-implement those primitives.

## Residual risks

- Unique weights in public metadata can distinguish entitlements.
- Randomized `Prepare` means clients must retain `prepared` and `inv` until
  unblinding succeeds. Losing them after a successful activate cannot be
  recovered by replaying a new blinding.
- The draft partially-blind scheme requires large derived public exponents;
  browser WebCrypto verification is not supported. Verification in this
  repository runs in Node.js.
