import { NextRequest, NextResponse } from "next/server";
import { krogerCartRequestSchema } from "@/retailers/kroger/apiSchemas";
import { krogerConnector, refreshCustomerToken } from "@/retailers/kroger/client";
import { krogerCartUrl } from "@/retailers/kroger/config";
import { krogerErrorResponse } from "@/retailers/kroger/http";
import {
  clearKrogerSession,
  readKrogerSession,
  writeKrogerSession,
} from "@/retailers/kroger/session";

export async function POST(request: NextRequest) {
  try {
    const body = krogerCartRequestSchema.parse(await request.json());
    let session = await readKrogerSession();

    if (!session) {
      return authenticationRequired();
    }

    if (session.expiresAt <= Date.now() + 30_000) {
      if (!session.refreshToken) {
        await clearKrogerSession();
        return authenticationRequired();
      }

      const token = await refreshCustomerToken(session.refreshToken);
      session = await writeKrogerSession({
        ...token,
        refresh_token: token.refresh_token ?? session.refreshToken,
      });
    }

    await krogerConnector.addToCart(session.accessToken, body.items);
    return NextResponse.json({ handoffUrl: krogerCartUrl });
  } catch (error) {
    return krogerErrorResponse(error);
  }
}

function authenticationRequired(): NextResponse {
  return NextResponse.json(
    {
      error: "Connect your Kroger account before continuing to checkout.",
      code: "KROGER_AUTH_REQUIRED",
    },
    { status: 401 },
  );
}
