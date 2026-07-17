import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getKrogerRedirectUri,
  krogerAuthorizeUrl,
  requireKrogerConfig,
  requireKrogerSessionSecret,
} from "@/retailers/kroger/config";
import { krogerErrorResponse } from "@/retailers/kroger/http";
import { setKrogerOAuthState } from "@/retailers/kroger/session";

export async function GET(request: NextRequest) {
  try {
    const config = requireKrogerConfig();
    requireKrogerSessionSecret();
    const state = randomBytes(32).toString("base64url");
    const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const redirectUri = getKrogerRedirectUri(request.url);
    const authorizeUrl = new URL(krogerAuthorizeUrl);
    authorizeUrl.searchParams.set("client_id", config.clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "cart.basic:write");
    authorizeUrl.searchParams.set("state", state);
    await setKrogerOAuthState(state, returnTo);
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    return krogerErrorResponse(error);
  }
}

function normalizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}
