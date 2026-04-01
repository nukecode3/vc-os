import { mockStats } from "@/lib/mock-data";

export async function GET() {
  return Response.json({
    status: "running",
    ...mockStats,
    uptime: "2h 34m",
    lastTick: new Date().toISOString(),
  });
}
