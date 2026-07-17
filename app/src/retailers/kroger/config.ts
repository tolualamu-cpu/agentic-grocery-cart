import "server-only";

export const krogerApiBaseUrl = "https://api.kroger.com/v1";
export const krogerAuthorizeUrl = `${krogerApiBaseUrl}/connect/oauth2/authorize`;
export const krogerTokenUrl = `${krogerApiBaseUrl}/connect/oauth2/token`;
export const krogerCartUrl = "https://www.kroger.com/cart";

export type KrogerConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  sessionSecret?: string;
};

export function getKrogerConfig(): KrogerConfig | null {
  const clientId = process.env.KROGER_CLIENT_ID?.trim();
  const clientSecret = process.env.KROGER_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: process.env.KROGER_REDIRECT_URI?.trim() || undefined,
    sessionSecret: process.env.KROGER_SESSION_SECRET?.trim() || undefined,
  };
}

export function requireKrogerConfig(): KrogerConfig {
  const config = getKrogerConfig();

  if (!config) {
    throw new KrogerConfigurationError(
      "Kroger is not configured. Add KROGER_CLIENT_ID and KROGER_CLIENT_SECRET to the server environment.",
    );
  }

  return config;
}

export function getKrogerRedirectUri(requestUrl: string): string {
  const configuredUri = requireKrogerConfig().redirectUri;

  if (configuredUri) {
    return configuredUri;
  }

  return new URL("/api/retailers/kroger/auth/callback", requestUrl).toString();
}

export function requireKrogerSessionSecret(): string {
  const secret = requireKrogerConfig().sessionSecret;

  if (!secret || secret.length < 32) {
    throw new KrogerConfigurationError(
      "KROGER_SESSION_SECRET must be at least 32 characters before Kroger account connection can be used.",
    );
  }

  return secret;
}

export class KrogerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KrogerConfigurationError";
  }
}
