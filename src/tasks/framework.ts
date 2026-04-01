/**
 * Task lifecycle management — modeled after Claude Code's utils/task/framework.ts
 *
 * Handles: task creation, state transitions, output polling, and garbage collection.
 * Tasks are persisted to disk (JSON files in data/tasks/) and tracked in AppState.
 */

import { randomBytes } from "crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { TaskState, TaskStatus, TaskType, AppState } from "../types/tool.js";

const TASK_DIR = join(process.cwd(), "data", "tasks");
const TASK_PREFIX: Record<string, string> = {
  ingest_yc: "iy",
  ingest_portfolio: "ip",
  ingest_founder: "if",
  ingest_deck: "id",
  research_market: "rm",
  research_founder: "rf",
  score_startup: "ss",
  outreach_email: "oe",
  generate_memo: "gm",
};

function generateTaskId(type: TaskType): string {
  const prefix = TASK_PREFIX[type] || "xx";
  const rand = randomBytes(8).toString("hex").slice(0, 12);
  return `${prefix}_${rand}`;
}

function ensureTaskDir(): void {
  if (!existsSync(TASK_DIR)) {
    mkdirSync(TASK_DIR, { recursive: true });
  }
}

function taskFilePath(taskId: string): string {
  return join(TASK_DIR, `${taskId}.json`);
}

function persistTask(task: TaskState): void {
  ensureTaskDir();
  writeFileSync(taskFilePath(task.id), JSON.stringify(task, null, 2));
}

export function registerTask(
  type: TaskType,
  description: string,
  getState: () => AppState,
  setState: (fn: (prev: AppState) => AppState) => void,
  dealId?: string,
): TaskState {
  const task: TaskState = {
    id: generateTaskId(type),
    type,
    status: "pending",
    description,
    dealId,
    notified: false,
  };

  setState((prev) => {
    const tasks = new Map(prev.tasks);
    tasks.set(task.id, task);
    return { ...prev, tasks };
  });

  persistTask(task);
  console.log(`[task] registered ${task.id}: ${description}`);
  return task;
}

export function updateTaskState(
  taskId: string,
  updates: Partial<Pick<TaskState, "status" | "output" | "agentId" | "outputFile">>,
  getState: () => AppState,
  setState: (fn: (prev: AppState) => AppState) => void,
): TaskState | null {
  const state = getState();
  const existing = state.tasks.get(taskId);
  if (!existing) return null;

  const updated: TaskState = {
    ...existing,
    ...updates,
    ...(updates.status === "running" && !existing.startTime ? { startTime: new Date() } : {}),
    ...(updates.status === "completed" || updates.status === "failed" ? { endTime: new Date() } : {}),
  };

  // Reference equality optimization — skip if nothing changed
  if (JSON.stringify(existing) === JSON.stringify(updated)) return existing;

  setState((prev) => {
    const tasks = new Map(prev.tasks);
    tasks.set(taskId, updated);
    return { ...prev, tasks };
  });

  persistTask(updated);
  console.log(`[task] ${taskId} → ${updated.status}`);
  return updated;
}

export function loadPersistedTasks(): Map<string, TaskState> {
  ensureTaskDir();
  const tasks = new Map<string, TaskState>();
  const files = readdirSync(TASK_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const raw = readFileSync(join(TASK_DIR, file), "utf-8");
      const task: TaskState = JSON.parse(raw);
      tasks.set(task.id, task);
    } catch {
      // Skip corrupted task files
    }
  }

  return tasks;
}

export function getTasksByStatus(state: AppState, status: TaskStatus): TaskState[] {
  return Array.from(state.tasks.values()).filter((t) => t.status === status);
}

export function getTasksByType(state: AppState, type: TaskType): TaskState[] {
  return Array.from(state.tasks.values()).filter((t) => t.type === type);
}

export function getTasksForDeal(state: AppState, dealId: string): TaskState[] {
  return Array.from(state.tasks.values()).filter((t) => t.dealId === dealId);
}

/**
 * Evict terminal tasks that have been notified — garbage collection.
 * Modeled after Claude Code's evictTerminalTask with grace period.
 */
export function evictTerminalTasks(
  setState: (fn: (prev: AppState) => AppState) => void,
  gracePeriodMs: number = 30_000,
): void {
  setState((prev) => {
    const tasks = new Map(prev.tasks);
    const now = Date.now();

    for (const [id, task] of tasks) {
      if (
        task.notified &&
        (task.status === "completed" || task.status === "failed") &&
        task.endTime &&
        now - new Date(task.endTime).getTime() > gracePeriodMs
      ) {
        tasks.delete(id);
      }
    }

    return { ...prev, tasks };
  });
}
