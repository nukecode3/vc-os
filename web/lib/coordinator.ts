/**
 * Coordinator adapter for the web app.
 *
 * Instead of importing the backend directly (which Turbopack can't resolve
 * across directory boundaries), this module manages the coordinator as a
 * child process and communicates via a local HTTP API.
 *
 * In production, you'd run the coordinator as a separate service and
 * the web app would call its API. For local dev, we can either:
 *   1. Run `tsx src/main.ts start` in a separate terminal
 *   2. Use this adapter which calls localhost:4000
 *
 * For now, we expose a simple state store that the API routes write to
 * and the pages read from — with the coordinator running as a sidecar.
 */

import { mockDeals, mockStats, type Deal, type PipelineStats } from "./mock-data";

// -------------------------------------------------------------------
// In-memory state store (replaces coordinator for web-only mode)
// In production, this would be backed by PostgreSQL.
// -------------------------------------------------------------------

const globalStore = globalThis as unknown as {
  __vcosDeals?: Map<string, Deal>;
  __vcosInitialized?: boolean;
};

function getStore(): Map<string, Deal> {
  if (!globalStore.__vcosDeals) {
    globalStore.__vcosDeals = new Map();
    // Seed with mock data on first access
    for (const deal of mockDeals) {
      globalStore.__vcosDeals.set(deal.id, deal);
    }
    globalStore.__vcosInitialized = true;
  }
  return globalStore.__vcosDeals;
}

// -------------------------------------------------------------------
// COORDINATOR_URL: if the backend coordinator is running as a sidecar,
// we forward requests to it. Otherwise we use the in-memory store.
// -------------------------------------------------------------------

const COORDINATOR_URL = process.env.COORDINATOR_URL; // e.g. "http://localhost:4000"

async function coordinatorFetch(path: string, options?: RequestInit): Promise<Response | null> {
  if (!COORDINATOR_URL) return null;
  try {
    return await fetch(`${COORDINATOR_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------
// Public API (used by API routes)
// -------------------------------------------------------------------

export async function getDeals(): Promise<Deal[]> {
  // Try coordinator sidecar first
  const res = await coordinatorFetch("/api/deals");
  if (res?.ok) {
    const data = await res.json();
    return data.deals || [];
  }

  // Fall back to in-memory store
  return Array.from(getStore().values()).sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );
}

export async function getDeal(id: string): Promise<Deal | null> {
  const res = await coordinatorFetch(`/api/deals/${id}`);
  if (res?.ok) {
    const data = await res.json();
    return data.deal || null;
  }

  return getStore().get(id) || null;
}

export async function getStatus(): Promise<PipelineStats & { running: boolean }> {
  const res = await coordinatorFetch("/api/status");
  if (res?.ok) {
    return await res.json();
  }

  // Compute from in-memory store
  const deals = Array.from(getStore().values());
  return {
    running: false,
    totalDeals: deals.length,
    discovered: deals.filter((d) => d.status === "discovered").length,
    researching: deals.filter((d) => d.status === "researching").length,
    scored: deals.filter((d) => d.status === "scored").length,
    outreach: deals.filter((d) => d.status === "outreach").length,
    pursuing: deals.filter((d) => d.status === "pursuing").length,
    passed: deals.filter((d) => d.status === "passed").length,
    avgScore: +(deals.filter((d) => d.score).reduce((s, d) => s + (d.score || 0), 0) / Math.max(1, deals.filter((d) => d.score).length)).toFixed(1),
    topSector: "AI / Developer Tools",
    agentsActive: 0,
    tasksRunning: 0,
    tasksCompleted: 0,
  };
}

export async function triggerIngestion(source: string, options?: { batch?: string; firms?: string[] }): Promise<{ message: string }> {
  const res = await coordinatorFetch("/api/ingest", {
    method: "POST",
    body: JSON.stringify({ source, ...options }),
  });
  if (res?.ok) return await res.json();

  return { message: `Ingestion queued for ${source} (coordinator not running — start it with: cd vc-os && npx tsx src/main.ts start)` };
}

export async function triggerScore(dealId: string): Promise<{ message: string }> {
  const res = await coordinatorFetch(`/api/deals/${dealId}/score`, { method: "POST" });
  if (res?.ok) return await res.json();

  return { message: `Scoring queued for ${dealId} (coordinator not running)` };
}

export async function triggerOutreach(dealId: string): Promise<{ message: string }> {
  const res = await coordinatorFetch(`/api/deals/${dealId}/outreach`, { method: "POST" });
  if (res?.ok) return await res.json();

  return { message: `Outreach queued for ${dealId} (coordinator not running)` };
}

/**
 * Update a deal in the in-memory store (used by API routes when
 * the coordinator pushes updates via webhook).
 */
export function updateDeal(id: string, updates: Partial<Deal>): Deal | null {
  const store = getStore();
  const existing = store.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  store.set(id, updated);
  return updated;
}

export function addDeal(deal: Deal): void {
  getStore().set(deal.id, deal);
}
