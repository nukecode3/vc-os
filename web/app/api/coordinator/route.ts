import type { NextRequest } from "next/server";
import { getStatus } from "@/lib/coordinator";

export async function GET() {
  const status = await getStatus();
  return Response.json(status);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  // These actions require the coordinator sidecar to be running
  const coordinatorUrl = process.env.COORDINATOR_URL;
  if (!coordinatorUrl) {
    return Response.json({
      error: "COORDINATOR_URL not set. Start the coordinator with: npx tsx src/main.ts start",
      hint: "Set COORDINATOR_URL=http://localhost:4000 in your .env",
    }, { status: 503 });
  }

  try {
    const res = await fetch(`${coordinatorUrl}/api/coordinator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (!res.ok) throw new Error(`Coordinator responded with ${res.status}`);
    return Response.json(await res.json());
  } catch (error) {
    return Response.json(
      { error: `Failed to ${action} coordinator: ${error}` },
      { status: 500 },
    );
  }
}
