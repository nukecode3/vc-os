import { getStatus } from "@/lib/coordinator";

export async function GET() {
  const status = await getStatus();
  return Response.json({
    ...status,
    lastTick: new Date().toISOString(),
  });
}
