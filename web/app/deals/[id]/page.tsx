"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  ExternalLink,
  Link2,
  TrendingUp,
  Shield,
  BookOpen,
  Target,
  Mail,
  FileText,
  Loader2,
} from "lucide-react";
import { ScoreBadge } from "@/components/score-badge";
import { StatusBadge } from "@/components/status-badge";
import { getDeal as getMockDeal, type Deal } from "@/lib/mock-data";
import { cn, getScoreColor, getRecommendationLabel } from "@/lib/utils";

export default function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [deal, setDeal] = useState<Deal | null | undefined>(getMockDeal(id));
  const [scoring, setScoring] = useState(false);
  const [outreaching, setOutreaching] = useState(false);

  // Try to fetch from real API
  useEffect(() => {
    fetch(`/api/deals/${id}`)
      .then((r) => r.json())
      .then((data) => { if (data.deal) setDeal(data.deal); })
      .catch(() => {});
  }, [id]);

  async function handleScore() {
    setScoring(true);
    await fetch(`/api/deals/${id}/score`, { method: "POST" });
    // Poll for completion
    const interval = setInterval(async () => {
      const res = await fetch(`/api/deals/${id}`);
      const data = await res.json();
      if (data.deal?.score != null) {
        setDeal(data.deal);
        setScoring(false);
        clearInterval(interval);
      }
    }, 3000);
    // Stop polling after 2 minutes
    setTimeout(() => { clearInterval(interval); setScoring(false); }, 120000);
  }

  async function handleOutreach() {
    setOutreaching(true);
    await fetch(`/api/deals/${id}/outreach`, { method: "POST" });
    setTimeout(() => setOutreaching(false), 3000);
  }

  if (!deal) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <h2 className="text-xl font-bold">Deal not found</h2>
          <Link href="/pipeline" className="text-accent mt-2 block">
            Back to pipeline
          </Link>
        </div>
      </div>
    );
  }

  const rec = deal.recommendation
    ? getRecommendationLabel(deal.recommendation)
    : null;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Back + Header */}
      <div>
        <Link
          href="/pipeline"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to pipeline
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{deal.companyName}</h1>
              <StatusBadge status={deal.status} />
            </div>
            <p className="text-muted-foreground mt-1">
              {deal.sector} · {deal.stage}
              {deal.batch && ` · ${deal.batch}`}
              {deal.source && ` · via ${deal.source}`}
            </p>
            {deal.oneLiner && (
              <p className="text-sm mt-3 max-w-2xl">{deal.oneLiner}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!deal.score && (
              <button
                onClick={handleScore}
                disabled={scoring}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {scoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                {scoring ? "Scoring..." : "Score Deal"}
              </button>
            )}
            <button
              onClick={handleOutreach}
              disabled={outreaching || !deal.score}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/80 disabled:opacity-50"
            >
              {outreaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {outreaching ? "Generating..." : "Generate Outreach"}
            </button>
          </div>
        </div>
      </div>

      {/* Score Overview */}
      {deal.score != null && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-start gap-8">
            {/* Main Score */}
            <div className="text-center">
              <ScoreBadge score={deal.score} size="lg" />
              <div className="mt-2 text-sm text-muted-foreground">Composite</div>
              {rec && (
                <div className={`mt-1 text-sm font-medium ${rec.color}`}>
                  {rec.label}
                </div>
              )}
            </div>

            {/* Sub-scores */}
            <div className="flex-1 grid grid-cols-4 gap-4">
              {[
                { label: "Team", score: deal.teamScore, weight: "35%" },
                { label: "Market", score: deal.marketScore, weight: "30%" },
                { label: "Traction", score: deal.tractionScore, weight: "20%" },
                { label: "Deck", score: deal.deckScore, weight: "15%" },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div
                    className={cn(
                      "text-2xl font-bold font-mono",
                      item.score ? getScoreColor(item.score) : "text-muted-foreground"
                    )}
                  >
                    {item.score?.toFixed(1) || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {item.label}
                  </div>
                  <div className="text-xs text-muted-foreground/60">
                    {item.weight} weight
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bull / Bear */}
          {(deal.bullCase || deal.bearCase) && (
            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-border">
              {deal.bullCase && (
                <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/10">
                  <div className="flex items-center gap-2 text-green-400 text-sm font-medium mb-2">
                    <TrendingUp className="w-4 h-4" /> Bull Case
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {deal.bullCase}
                  </p>
                </div>
              )}
              {deal.bearCase && (
                <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/10">
                  <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-2">
                    <Shield className="w-4 h-4" /> Bear Case
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {deal.bearCase}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Founders */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <User className="w-4 h-4" /> Founding Team
        </h2>
        <div className="space-y-6">
          {deal.founders.map((founder) => (
            <div key={founder.name} className="flex gap-6">
              {/* Profile */}
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-sm font-bold">
                    {founder.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div className="font-medium">{founder.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {founder.role}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    {founder.linkedinUrl && (
                      <a href={founder.linkedinUrl} target="_blank" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
                        <Link2 className="w-3.5 h-3.5" /> LinkedIn
                      </a>
                    )}
                    {founder.githubUrl && (
                      <a href={founder.githubUrl} target="_blank" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
                        <ExternalLink className="w-3.5 h-3.5" /> GitHub
                      </a>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {founder.background}
                </p>

                {/* Archetype + PG Pattern */}
                {(founder.archetypeMatch || founder.pgPattern) && (
                  <div className="mt-3 space-y-1">
                    {founder.archetypeMatch && (
                      <div className="flex items-center gap-2 text-xs">
                        <Target className="w-3 h-3 text-accent" />
                        <span className="text-muted-foreground">{founder.archetypeMatch}</span>
                      </div>
                    )}
                    {founder.pgPattern && (
                      <div className="flex items-center gap-2 text-xs">
                        <BookOpen className="w-3 h-3 text-amber-400" />
                        <span className="text-muted-foreground">
                          PG pattern: &ldquo;{founder.pgPattern}&rdquo;
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-3 w-48">
                {[
                  { label: "Technical", score: founder.technicalDepth },
                  { label: "Execution", score: founder.executionVelocity },
                  { label: "Domain", score: founder.domainExpertise },
                  { label: "Network", score: founder.networkScore },
                ].map((s) => (
                  <div key={s.label} className="text-center p-2 bg-muted/30 rounded-lg">
                    <div className={cn("text-lg font-bold font-mono", getScoreColor(s.score))}>
                      {s.score}
                    </div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparables */}
      {deal.comparables.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4">Comparable Companies (Seed Stage)</h2>
          <div className="space-y-3">
            {deal.comparables.map((comp) => (
              <div
                key={comp.name}
                className="flex items-center gap-4 p-3 bg-muted/20 rounded-lg"
              >
                <div className="font-medium w-32">{comp.name}</div>
                <div className="text-xs text-muted-foreground w-40">
                  {comp.outcome}
                </div>
                <div className="flex-1 text-sm text-muted-foreground">
                  {comp.keyParallel}
                </div>
                <div
                  className={cn(
                    "text-sm font-mono font-medium",
                    getScoreColor(comp.similarity * 10)
                  )}
                >
                  {(comp.similarity * 100).toFixed(0)}% match
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
