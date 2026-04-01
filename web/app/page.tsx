import Link from "next/link";
import {
  TrendingUp,
  Target,
  Zap,
  CheckCircle,
  ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { ScoreBadge } from "@/components/score-badge";
import { StatusBadge } from "@/components/status-badge";
import { mockDeals, mockStats } from "@/lib/mock-data";
import { timeAgo, getRecommendationLabel } from "@/lib/utils";

export default function Dashboard() {
  const topDeals = mockDeals
    .filter((d) => d.score != null)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);

  const recentDeals = [...mockDeals]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your deal intelligence pipeline
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Deals"
          value={mockStats.totalDeals}
          subtitle={`${mockStats.scored} scored, ${mockStats.outreach} in outreach`}
          icon={Target}
        />
        <StatCard
          title="Avg Score"
          value={mockStats.avgScore}
          subtitle="Across scored deals"
          icon={TrendingUp}
          trend={{ value: "+0.3", positive: true }}
        />
        <StatCard
          title="Agents Active"
          value={mockStats.agentsActive}
          subtitle={`${mockStats.tasksRunning} tasks running`}
          icon={Zap}
        />
        <StatCard
          title="Tasks Completed"
          value={mockStats.tasksCompleted}
          subtitle="Last 7 days"
          icon={CheckCircle}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Top Scored Deals */}
        <div className="bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="font-semibold">Top Scored Deals</h2>
            <Link
              href="/pipeline"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {topDeals.map((deal) => {
              const rec = deal.recommendation
                ? getRecommendationLabel(deal.recommendation)
                : null;
              return (
                <Link
                  key={deal.id}
                  href={`/deals/${deal.id}`}
                  className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{deal.companyName}</div>
                    <div className="text-xs text-muted-foreground">
                      {deal.sector} · {deal.stage}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {rec && (
                      <span className={`text-xs font-medium ${rec.color}`}>
                        {rec.label}
                      </span>
                    )}
                    <ScoreBadge score={deal.score} size="sm" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="font-semibold">Recent Activity</h2>
          </div>
          <div className="divide-y divide-border">
            {recentDeals.map((deal) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1 mr-3">
                  <div className="font-medium truncate">{deal.companyName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {deal.oneLiner?.slice(0, 60)}...
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={deal.status} />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo(deal.updatedAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline Funnel */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold mb-4">Pipeline Funnel</h2>
        <div className="flex items-end gap-2 h-32">
          {[
            { label: "Discovered", count: mockStats.discovered, color: "bg-blue-500" },
            { label: "Researching", count: mockStats.researching, color: "bg-purple-500" },
            { label: "Scored", count: mockStats.scored, color: "bg-emerald-500" },
            { label: "Outreach", count: mockStats.outreach, color: "bg-amber-500" },
            { label: "Pursuing", count: mockStats.pursuing, color: "bg-green-500" },
            { label: "Passed", count: mockStats.passed, color: "bg-zinc-600" },
          ].map((stage) => (
            <div key={stage.label} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-lg font-bold">{stage.count}</span>
              <div
                className={`w-full rounded-t-md ${stage.color}`}
                style={{ height: `${Math.max(8, (stage.count / mockStats.totalDeals) * 100)}%` }}
              />
              <span className="text-xs text-muted-foreground">{stage.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
