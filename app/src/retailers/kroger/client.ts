import "server-only";

import type { GroceryNeed, UserPreferences } from "@/domain/grocery";
import type {
  RetailerCartItem,
  RetailerConnector,
  RetailerLocation,
  RetailerProductSearch,
} from "@/retailers/types";
import {
  krogerApiBaseUrl,
  krogerTokenUrl,
  requireKrogerConfig,
} from "@/retailers/kroger/config";
import {
  krogerLocationSchema,
  krogerLocationsResponseSchema,
  krogerProductsResponseSchema,
  krogerTokenResponseSchema,
  type KrogerTokenResponse,
} from "@/retailers/kroger/contracts";
import { mapKrogerLocation, mapKrogerProductsForNeed } from "@/retailers/kroger/mapper";

const productCacheTtlMs = 5 * 60 * 1_000;
const productCache = new Map<string, { expiresAt: number; value: unknown }>();
let applicationToken: { accessToken: string; expiresAt: number } | null = null;

export class KrogerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "KROGER_API_ERROR",
  ) {
    super(message);
    this.name = "KrogerApiError";
  }
}

export class KrogerConnector implements RetailerConnector {
  readonly id = "kroger" as const;

  async listLocations(zipCode: string): Promise<RetailerLocation[]> {
    const token = await getApplicationAccessToken();
    const url = new URL(`${krogerApiBaseUrl}/locations`);
    url.searchParams.set("filter.zipCode.near", zipCode);
    url.searchParams.set("filter.radiusInMiles", "25");
    url.searchParams.set("filter.limit", "10");
    url.searchParams.set("filter.chain", "Kroger");
    const response = await krogerFetch(url, token);
    const payload = krogerLocationsResponseSchema.parse(await response.json());

    return payload.data.map(mapKrogerLocation);
  }

  async getLocation(locationId: string): Promise<RetailerLocation> {
    const token = await getApplicationAccessToken();
    const response = await krogerFetch(
      `${krogerApiBaseUrl}/locations/${encodeURIComponent(locationId)}`,
      token,
    );
    const payload = await response.json();
    const rawLocation = krogerLocationSchema.parse(
      typeof payload === "object" && payload && "data" in payload
        ? (payload as { data: unknown }).data
        : payload,
    );

    return mapKrogerLocation(rawLocation);
  }

  async searchNeed(
    need: GroceryNeed,
    preferences: UserPreferences,
    location: RetailerLocation,
  ): Promise<RetailerProductSearch> {
    const fulfillment = preferences.fulfillmentMode === "pickup" ? "csp" : "dth";
    const cacheKey = `${location.retailer.locationId}:${fulfillment}:${need.canonicalName.toLowerCase()}`;
    const cached = productCache.get(cacheKey);
    let rawPayload: unknown;

    if (cached && cached.expiresAt > Date.now()) {
      rawPayload = cached.value;
    } else {
      const token = await getApplicationAccessToken();
      const url = new URL(`${krogerApiBaseUrl}/products`);
      url.searchParams.set("filter.term", need.canonicalName);
      url.searchParams.set("filter.locationId", location.retailer.locationId);
      url.searchParams.set("filter.fulfillment", fulfillment);
      url.searchParams.set("filter.limit", "24");
      const response = await krogerFetch(url, token);
      rawPayload = await response.json();
      productCache.set(cacheKey, { expiresAt: Date.now() + productCacheTtlMs, value: rawPayload });
    }

    const payload = krogerProductsResponseSchema.parse(rawPayload);
    const retrievedAt = new Date().toISOString();

    return mapKrogerProductsForNeed({
      products: payload.data,
      need,
      preferences,
      location,
      retrievedAt,
    });
  }

  async addToCart(accessToken: string, items: RetailerCartItem[]): Promise<void> {
    await krogerFetch(`${krogerApiBaseUrl}/cart/add`, accessToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((item) => ({
          quantity: item.quantity,
          upc: item.upc,
          modality: item.fulfillmentMode === "pickup" ? "PICKUP" : "DELIVERY",
        })),
      }),
    });
  }
}

export const krogerConnector = new KrogerConnector();

export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<KrogerTokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  );
}

export async function refreshCustomerToken(refreshToken: string): Promise<KrogerTokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

async function getApplicationAccessToken(): Promise<string> {
  if (applicationToken && applicationToken.expiresAt > Date.now() + 30_000) {
    return applicationToken.accessToken;
  }

  const token = await requestToken(
    new URLSearchParams({
      grant_type: "client_credentials",
      scope: "product.compact",
    }),
  );
  applicationToken = {
    accessToken: token.access_token,
    expiresAt: Date.now() + (token.expires_in ?? 1_800) * 1_000,
  };

  return applicationToken.accessToken;
}

async function requestToken(body: URLSearchParams): Promise<KrogerTokenResponse> {
  const config = requireKrogerConfig();
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(krogerTokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await toKrogerApiError(response, "Kroger OAuth request failed.");
  }

  return krogerTokenResponseSchema.parse(await response.json());
}

async function krogerFetch(
  input: string | URL,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw await toKrogerApiError(response, "Kroger could not complete the request.");
  }

  return response;
}

async function toKrogerApiError(response: Response, fallback: string): Promise<KrogerApiError> {
  let detail = "";

  try {
    const payload = (await response.json()) as {
      error_description?: string;
      error?: string;
      errors?: Array<{ reason?: string }> | { reason?: string };
    };
    const errors = Array.isArray(payload.errors) ? payload.errors : payload.errors ? [payload.errors] : [];
    detail = payload.error_description ?? errors[0]?.reason ?? payload.error ?? "";
  } catch {
    detail = "";
  }

  const message = detail ? `${fallback} ${detail}` : fallback;
  return new KrogerApiError(message, response.status);
}
