import type { NextRequest } from "next/server";
import { triggerIngestion } from "@/lib/coordinator";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { source, batch, firms } = body;

  const result = await triggerIngestion(source, { batch, firms });
  return Response.json(result);
}
