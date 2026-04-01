import { cn, formatScore, getScoreColor, getScoreBg } from "@/lib/utils";

export function ScoreBadge({
  score,
  size = "md",
}: {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  if (score == null) {
    return (
      <span className="text-muted-foreground text-sm">—</span>
    );
  }

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-2xl px-4 py-2 font-bold",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-mono font-semibold",
        getScoreBg(score),
        getScoreColor(score),
        sizeClasses[size]
      )}
    >
      {formatScore(score)}
    </span>
  );
}
