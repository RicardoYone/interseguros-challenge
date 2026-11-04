import { errors, importPKCS8, importSPKI, jwtVerify, SignJWT, type CryptoKey } from 'jose';
import { InvalidTokenError } from '../domain/errors.js';
import type {
  AccessToken,
  TokenIssuer,
  TokenVerifier,
  VerifiedIdentity,
} from '../domain/ports.js';

const SIGNING_ALGORITHM = 'ES256';

export interface JoseTokenServiceOptions {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly issuer: string;
  readonly audience: string;
  readonly ttlSeconds: number;
}

interface ServiceSettings {
  readonly privateKey: CryptoKey;
  readonly publicKey: CryptoKey;
  readonly issuer: string;
  readonly audience: string;
  readonly ttlSeconds: number;
}

/** Issues and verifies ES256 access tokens. */
export class JoseTokenService implements TokenIssuer, TokenVerifier {
  readonly #settings: ServiceSettings;

  private constructor(settings: ServiceSettings) {
    this.#settings = settings;
  }

  /** Imports the keys up front so that an invalid key stops the service at startup. */
  static async create(options: JoseTokenServiceOptions): Promise<JoseTokenService> {
    const { privateKeyPem, publicKeyPem, issuer, audience, ttlSeconds } = options;

    return new JoseTokenService({
      privateKey: await importPKCS8(privateKeyPem, SIGNING_ALGORITHM),
      publicKey: await importSPKI(publicKeyPem, SIGNING_ALGORITHM),
      issuer,
      audience,
      ttlSeconds,
    });
  }

  async issue(subject: string): Promise<AccessToken> {
    const { privateKey, issuer, audience, ttlSeconds } = this.#settings;
    const token = await new SignJWT()
      .setProtectedHeader({ alg: SIGNING_ALGORITHM })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime(`${String(ttlSeconds)}s`)
      .sign(privateKey);

    return { token, expiresInSeconds: ttlSeconds };
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    const { publicKey, issuer, audience } = this.#settings;

    try {
      const { payload } = await jwtVerify(token, publicKey, {
        // Pinning the algorithm is what defeats "alg: none" and algorithm confusion.
        algorithms: [SIGNING_ALGORITHM],
        issuer,
        audience,
        requiredClaims: ['exp', 'sub'],
      });

      return { subject: String(payload.sub) };
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        throw new InvalidTokenError({ cause: error });
      }
      throw error;
    }
  }
}
