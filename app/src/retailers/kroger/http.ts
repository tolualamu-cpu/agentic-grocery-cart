import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { KrogerApiError } from "@/retailers/kroger/client";
import { KrogerConfigurationError } from "@/retailers/kroger/config";

export function krogerErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "The Kroger request was invalid.", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  if (error instanceof KrogerConfigurationError) {
    return NextResponse.json(
      { error: error.message, code: "KROGER_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  if (error instanceof KrogerApiError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }

  console.error("Unexpected Kroger connector error", error);
  return NextResponse.json(
    { error: "Kroger is temporarily unavailable.", code: "KROGER_UNAVAILABLE" },
    { status: 502 },
  );
}
