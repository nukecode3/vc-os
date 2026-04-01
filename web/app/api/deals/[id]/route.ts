import type { NextRequest } from "next/server";
import { getDeal } from "@/lib/mock-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deal = getDeal(id);

  if (!deal) {
    return Response.json({ error: "Deal not found" }, { status: 404 });
  }

  return Response.json({ deal });
}
