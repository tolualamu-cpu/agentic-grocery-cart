import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode } from "@/retailers/kroger/client";
import { getKrogerRedirectUri } from "@/retailers/kroger/config";
import { consumeKrogerOAuthState, writeKrogerSession } from "@/retailers/kroger/session";

export async function GET(request: NextRequest) {
  const { state: expectedState, returnTo } = await consumeKrogerOAuthState();
  const target = new URL(returnTo, request.url);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError || !code || !state || !expectedState || !statesMatch(state, expectedState)) {
    target.searchParams.set("kroger", oauthError === "access_denied" ? "cancelled" : "error");
    return NextResponse.redirect(target);
  }

  try {
    const token = await exchangeAuthorizationCode(code, getKrogerRedirectUri(request.url));
    await writeKrogerSession(token);
    target.searchParams.set("kroger", "connected");
    return NextResponse.redirect(target);
  } catch {
    target.searchParams.set("kroger", "error");
    return NextResponse.redirect(target);
  }
}

function statesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
