import { generateIssuerKeyMaterial, pkcs8DerToPem } from './issuer-keys.js';

const material = await generateIssuerKeyMaterial();
process.stdout.write(
  `${pkcs8DerToPem(material.privateKeyPkcs8DerBase64url)}\n`,
);
process.stderr.write(
  `ISSUER_PRIVATE_KEY=${material.privateKeyPkcs8DerBase64url}\n`,
);
