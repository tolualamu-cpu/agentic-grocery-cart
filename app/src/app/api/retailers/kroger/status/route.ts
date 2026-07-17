import { NextResponse } from "next/server";
import { getKrogerConfig } from "@/retailers/kroger/config";
import { krogerErrorResponse } from "@/retailers/kroger/http";
import { clearKrogerSession, readKrogerSession } from "@/retailers/kroger/session";

export async function GET() {
  try {
    const config = getKrogerConfig();
    const catalogConfigured = Boolean(config);
    const cartConfigured = Boolean(config?.sessionSecret && config.sessionSecret.length >= 32);
    const session = cartConfigured ? await readKrogerSession() : null;

    return NextResponse.json({
      retailer: "kroger",
      catalogConfigured,
      cartConfigured,
      connected: Boolean(session && (session.expiresAt > Date.now() || session.refreshToken)),
    });
  } catch (error) {
    return krogerErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    await clearKrogerSession();
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return krogerErrorResponse(error);
  }
}
