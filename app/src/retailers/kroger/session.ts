import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireKrogerSessionSecret } from "@/retailers/kroger/config";
import type { KrogerTokenResponse } from "@/retailers/kroger/contracts";

export const krogerSessionCookieName = "gini_kroger_session";
export const krogerOAuthStateCookieName = "gini_kroger_oauth_state";
export const krogerReturnToCookieName = "gini_kroger_return_to";

export type KrogerSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
};

export async function readKrogerSession(): Promise<KrogerSession | null> {
  const cookieStore = await cookies();
  const encrypted = cookieStore.get(krogerSessionCookieName)?.value;

  if (!encrypted) {
    return null;
  }

  try {
    return decryptSession(encrypted);
  } catch {
    return null;
  }
}

export async function writeKrogerSession(token: KrogerTokenResponse): Promise<KrogerSession> {
  const session: KrogerSession = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (token.expires_in ?? 1_800) * 1_000,
    scope: token.scope,
  };
  const maxAge = Math.max(token.expires_in ?? 1_800, token.refresh_token ? 30 * 24 * 60 * 60 : 1_800);
  const cookieStore = await cookies();
  cookieStore.set(krogerSessionCookieName, encryptSession(session), secureCookieOptions(maxAge));
  return session;
}

export async function clearKrogerSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(krogerSessionCookieName);
}

export async function setKrogerOAuthState(state: string, returnTo: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(krogerOAuthStateCookieName, state, secureCookieOptions(10 * 60));
  cookieStore.set(krogerReturnToCookieName, returnTo, secureCookieOptions(10 * 60));
}

export async function consumeKrogerOAuthState(): Promise<{
  state?: string;
  returnTo: string;
}> {
  const cookieStore = await cookies();
  const state = cookieStore.get(krogerOAuthStateCookieName)?.value;
  const returnTo = normalizeReturnTo(cookieStore.get(krogerReturnToCookieName)?.value);
  cookieStore.delete(krogerOAuthStateCookieName);
  cookieStore.delete(krogerReturnToCookieName);
  return { state, returnTo };
}

function encryptSession(session: KrogerSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((value) => value.toString("base64url")).join(".");
}

function decryptSession(value: string): KrogerSession {
  const [encodedIv, encodedTag, encodedCiphertext] = value.split(".");

  if (!encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error("Invalid Kroger session.");
  }

  const decipher = createDecipheriv("aes-256-gcm", sessionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as KrogerSession;

  if (!parsed.accessToken || !Number.isFinite(parsed.expiresAt)) {
    throw new Error("Invalid Kroger session payload.");
  }

  return parsed;
}

function sessionKey(): Buffer {
  return createHash("sha256").update(requireKrogerSessionSecret()).digest();
}

function secureCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function normalizeReturnTo(value?: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}
