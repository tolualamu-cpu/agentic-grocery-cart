import { NextRequest, NextResponse } from "next/server";
import { krogerConnector } from "@/retailers/kroger/client";
import { krogerErrorResponse } from "@/retailers/kroger/http";

export async function GET(request: NextRequest) {
  const zipCode = request.nextUrl.searchParams.get("zipCode")?.trim() ?? "";

  if (!/^\d{5}(?:-\d{4})?$/.test(zipCode)) {
    return NextResponse.json(
      { error: "Enter a valid US ZIP code.", code: "INVALID_ZIP_CODE" },
      { status: 400 },
    );
  }

  try {
    const locations = await krogerConnector.listLocations(zipCode);
    return NextResponse.json({ locations });
  } catch (error) {
    return krogerErrorResponse(error);
  }
}
