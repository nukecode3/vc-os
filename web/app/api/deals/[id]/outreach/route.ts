import type { NextRequest } from "next/server";
import { triggerOutreach, getDeal } from "@/lib/coordinator";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deal = await getDeal(id);

  if (!deal) {
    return Response.json({ error: "Deal not found" }, { status: 404 });
  }

  if (!deal.score) {
    return Response.json(
      { error: "Deal must be scored before generating outreach" },
      { status: 400 },
    );
  }

  const result = await triggerOutreach(id);
  return Response.json(result);
}
