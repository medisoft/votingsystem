import type { AppConfig } from '../src/config.js';

/**
 * Development-only RSA-2048 issuer private key (PKCS8 DER, base64url).
 * Generated with `npm run issuer:generate -w @voting/registration-api`.
 */
export const testIssuerPrivateKey =
  'MIIEwAIBADANBgkqhkiG9w0BAQEFAASCBKowggSmAgEAAoIBAQDZ6ZfdvsI-7DL7zLUHPjQfEuFc6Zf_vTpQ9ktYPPqK_OQyaWm3J1tZnuEsycf9IEiK_k6-lUoENZJMrUBKgAn2z8jBPWHz_o25Brd_tLJdre4wIw66HYFuAZdDY4Jbf7MFOnlbJ9tEUl370FHaCHhuHqZcxxyqS4x_zTPfp3Wnh8y8MS8ct_hJTEd5pcM-JjQ4Aukna0jVlzyzARysFwhcVowZPLHbwCefwC6veqqfRekjnXbK_EsO8Pfs9dd84rm4lsFU2Qw9Z2JxByhbf0oFPCo2j2XMn0RWX9J_jcq7bdGw3I3OQpl3U_sk_sy141fFqA8IcdBxY4rjh0M1j5cNAgMBAAECggEBAJNVAl7kmMSeQiJI16ScA_V2eHSvYxt_vyv6Ohrgr6zFKyyCZP12WKcRasEzdEnKSAHhyy_EFBUge1foU22LgDElb2BnthCX7Q5KYkqvy2DXNhHJwi1Hwbi0zqa7YummP02rqV1eZzucTPrycETwMSyTAHv-C32AMvA9t3Lh8ARh5ju3Hxc8gSwEvg0ZeZV2x2efiJ5piXWPnPF1AT0-0z4q-9ri1HCXfjlPWAEI4W2kOvsQ2l_BS4UVq9jeheWzSkepPHhqTTX0C9zs3SXbvHb9m9irzOzXIX_PxIfTcuJouUm3ZG71XKmpD-KRF7_YP4QX5NhCa_KIndPWaap16-kCgYEA2f4xYbIJVV6zzINxNA_DXCeMdUgHtwRNn8CrCbsDP8bNRIFsvTrCOL_VknDbxn4ivLqWuzLyDPfj2gmtYEKKpbibnyHMYzLbpkDqBeSQLSxJQ5rtjalR9p1inwHL3pzlH5tC5OAWqGvHWBHTPts7Ml2xfY3mQiJVl9PMzXoe10MCgYEA_-fPDCKMA_C4YhW36X1CFKf6Nl2sEO1fFz_nqZIVaPMYbBuAC6BnK8DKNtYOBiTq93JIZCpln5DAr9jM802_4Fr3rYroqzZJHzJc4gS4QmuC7bCDmIM7GkNRUbiqLzJUciX1RzsvxLnYi0wDzaHOdFj6055M51t5CecoU8dYK28CgYEAnkG14_D2aa245i4-jscq0so7ZCGIyEstd17OTOAhubk_6A31vWLdAYnzKL8aLn4ABfeH2htgMh38opwH7Cwir7DX-az1zsZrQ8U4oFKQgNr3zUa6Uu-re1hC8qDBOrm4dTuoUrSEfnzQWZWHQMizrxrp8faERVrbvL-cnUedADUCgYEAxNKf9q9jjWxKBHa720PR3V1NHx9wxhwr9Q_buBp5iRzf_dYw58BZWdeQMBj29FbUubkWYKQTQWTuLtHK4J8-IusUcE_UoErCdtIfil8i8UMLkpEexeC5RnvcQcSMcHx_YsQ7IKwvE1n1aT3v9uqqheYiFT093PwH3kwCQl2iPNUCgYEAwKdUQGEpwKwJqijjeQJqrkSXGcuEEj8IrYAOHif6vR0cyVeDfOmUVtvlBaslQT0KOJ3eNJqvQ2YNFVXezPjPiTyKIClzR7CMdwp971IGhZQfKiMoxFTRv9IkqLJ0sn62P3sEf6oz0PZCELLrM-2L0tE9zpYgbSB7_K9XmJXcA5Y';

/**
 * Builds an AppConfig for unit and integration tests.
 *
 * @param overrides - Optional replacements for individual config fields.
 * @returns A complete test configuration including the development RSA issuer key.
 */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 3001,
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgresql://x:x@localhost:5432/x',
    ADMIN_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'silent',
    AUDIT_RETENTION_DAYS: 2555,
    APPLICATION_LOG_RETENTION_DAYS: 30,
    SOURCE_IP_MODE: 'truncated',
    CSRF_ORIGIN_CHECK: false,
    ISSUER_PRIVATE_KEY: testIssuerPrivateKey,
    ISSUER_KEY_VERSION: 'test-2026-01',
    ISSUER_ID: 'condominium-registration-service',
    ...overrides,
  };
}
