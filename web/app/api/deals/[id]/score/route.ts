import type { NextRequest } from "next/server";
import { triggerScore, getDeal } from "@/lib/coordinator";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deal = await getDeal(id);

  if (!deal) {
    return Response.json({ error: "Deal not found" }, { status: 404 });
  }

  const result = await triggerScore(id);
  return Response.json(result);
}
