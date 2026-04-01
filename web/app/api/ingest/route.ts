import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { source, batch, firms } = body;

  // In production, this would call the coordinator
  // await coordinator.ingestYCBatch(batch);
  // await coordinator.ingestVCPortfolios(firms);

  return Response.json({
    message: `Ingestion started for ${source}`,
    taskId: `task_${Date.now()}`,
    source,
    batch,
    firms,
  });
}
