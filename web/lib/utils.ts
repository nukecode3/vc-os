import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScore(score: number | null | undefined): string {
  if (score == null) return "—";
  return score.toFixed(1);
}

export function getScoreColor(score: number): string {
  if (score >= 8) return "text-green-400";
  if (score >= 6.5) return "text-emerald-400";
  if (score >= 5) return "text-yellow-400";
  if (score >= 3.5) return "text-orange-400";
  return "text-red-400";
}

export function getScoreBg(score: number): string {
  if (score >= 8) return "bg-green-500/10 border-green-500/20";
  if (score >= 6.5) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 5) return "bg-yellow-500/10 border-yellow-500/20";
  if (score >= 3.5) return "bg-orange-500/10 border-orange-500/20";
  return "bg-red-500/10 border-red-500/20";
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    discovered: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    researching: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    scored: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    outreach: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    passed: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    pursuing: "bg-green-500/10 text-green-400 border-green-500/20",
  };
  return colors[status] || "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
}

export function getRecommendationLabel(rec: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    strong_interest: { label: "Strong Interest", color: "text-green-400" },
    interested: { label: "Interested", color: "text-emerald-400" },
    maybe: { label: "Maybe", color: "text-yellow-400" },
    pass: { label: "Pass", color: "text-orange-400" },
    strong_pass: { label: "Strong Pass", color: "text-red-400" },
  };
  return map[rec] || { label: rec, color: "text-zinc-400" };
}

export function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
