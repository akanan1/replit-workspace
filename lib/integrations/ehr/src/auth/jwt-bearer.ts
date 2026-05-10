import { randomUUID } from "node:crypto";
import { signJwt } from "./jwt";
import type {
  AccessToken,
  JwtBearerAuthConfig,
  TokenProvider,
} from "./types";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

const REFRESH_SKEW_MS = 30_000;
const DEFAULT_ASSERTION_LIFETIME_SECONDS = 300;
const CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

export class JwtBearerAuthProvider implements TokenProvider {
  private readonly config: JwtBearerAuthConfig;
  private readonly fetchImpl: typeof fetch;
  private cached: AccessToken | null = null;
  private inflight: Promise<AccessToken> | null = null;

  constructor(config: JwtBearerAuthConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async getToken(): Promise<string> {
    const token = await this.getAccessToken();
    return token.token;
  }

  async getAccessToken(): Promise<AccessToken> {
    if (this.cached && this.cached.expiresAt - REFRESH_SKEW_MS > Date.now()) {
      return this.cached;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  invalidate(): void {
    this.cached = null;
  }

  private buildAssertion(): string {
    const now = Math.floor(Date.now() / 1000);
    const lifetime =
      this.config.assertionLifetimeSeconds ??
      DEFAULT_ASSERTION_LIFETIME_SECONDS;

    const header: Record<string, unknown> = {};
    if (this.config.keyId) header.kid = this.config.keyId;

    const claims: Record<string, unknown> = {
      iss: this.config.clientId,
      sub: this.config.clientId,
      aud: this.config.audience ?? this.config.tokenUrl,
      jti: randomUUID(),
      iat: now,
      exp: now + lifetime,
    };

    return signJwt({
      header,
      claims,
      privateKey: this.config.privateKey,
      algorithm: this.config.algorithm,
    });
  }

  private async fetchToken(): Promise<AccessToken> {
    const body = new URLSearchParams();
    body.set("grant_type", "client_credentials");
    body.set("client_assertion_type", CLIENT_ASSERTION_TYPE);
    body.set("client_assertion", this.buildAssertion());
    if (this.config.scope) body.set("scope", this.config.scope);

    const res = await this.fetchImpl(this.config.tokenUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `JWT-bearer token request failed: ${res.status} ${res.statusText}` +
          (detail ? ` — ${detail}` : ""),
      );
    }

    const json = (await res.json()) as TokenResponse;
    const token: AccessToken = {
      token: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
      tokenType: json.token_type,
      scope: json.scope,
    };
    this.cached = token;
    return token;
  }
}
