import { NextRequest, NextResponse } from "next/server";
import { krogerCartPreviewRequestSchema } from "@/retailers/kroger/apiSchemas";
import { krogerErrorResponse } from "@/retailers/kroger/http";
import { buildKrogerCartPreview } from "@/retailers/kroger/preview";

export async function POST(request: NextRequest) {
  try {
    const body = krogerCartPreviewRequestSchema.parse(await request.json());
    const preview = await buildKrogerCartPreview(
      body.needs,
      body.preferences,
      body.locationId,
    );
    return NextResponse.json(preview);
  } catch (error) {
    return krogerErrorResponse(error);
  }
}
