"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Filter, ArrowUpDown, Play, Download } from "lucide-react";
import { ScoreBadge } from "@/components/score-badge";
import { StatusBadge } from "@/components/status-badge";
import { mockDeals, type Deal } from "@/lib/mock-data";
import { cn, timeAgo, getRecommendationLabel } from "@/lib/utils";

type SortField = "score" | "companyName" | "updatedAt" | "status";
type SortDir = "asc" | "desc";

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>(mockDeals);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Fetch deals from API on mount, fall back to mock data
  useEffect(() => {
    fetch("/api/deals")
      .then((res) => res.json())
      .then((data) => {
        if (data.deals?.length > 0) setDeals(data.deals);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleRunIngestion() {
    await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "yc" }),
    });
    // Refresh deals after a delay (ingestion is async)
    setTimeout(() => {
      fetch("/api/deals").then((r) => r.json()).then((d) => {
        if (d.deals?.length > 0) setDeals(d.deals);
      });
    }, 5000);
  }
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const statuses = ["all", "discovered", "researching", "scored", "outreach", "pursuing", "passed"];

  let filtered = deals.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.companyName.toLowerCase().includes(q) ||
        d.sector.toLowerCase().includes(q) ||
        d.founders.some((f) => f.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  filtered.sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "score":
        cmp = (a.score || 0) - (b.score || 0);
        break;
      case "companyName":
        cmp = a.companyName.localeCompare(b.companyName);
        break;
      case "updatedAt":
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deal Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} deals · {deals.filter((d) => d.score).length} scored
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRunIngestion}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors"
          >
            <Play className="w-4 h-4" />
            Run Ingestion
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted/50 transition-colors">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search deals, sectors, founders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors",
                statusFilter === s
                  ? "bg-accent/10 text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left">
              {[
                { field: "companyName" as SortField, label: "Company" },
                { field: "status" as SortField, label: "Status" },
                { field: "score" as SortField, label: "Score" },
              ].map(({ field, label }) => (
                <th
                  key={field}
                  className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                  onClick={() => toggleSort(field)}
                >
                  <div className="flex items-center gap-1">
                    {label}
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              ))}
              <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Sector
              </th>
              <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Founders
              </th>
              <th className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Recommendation
              </th>
              <th
                className="px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                onClick={() => toggleSort("updatedAt")}
              >
                <div className="flex items-center gap-1">
                  Updated
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((deal) => {
              const rec = deal.recommendation
                ? getRecommendationLabel(deal.recommendation)
                : null;
              return (
                <tr
                  key={deal.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/deals/${deal.id}`}
                      className="font-medium hover:text-accent transition-colors"
                    >
                      {deal.companyName}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {deal.stage}
                      {deal.batch && ` · ${deal.batch}`}
                      {deal.source && ` · via ${deal.source}`}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={deal.status} />
                  </td>
                  <td className="px-5 py-4">
                    <ScoreBadge score={deal.score} />
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">
                    {deal.sector}
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {deal.founders.map((f) => f.name).join(", ")}
                  </td>
                  <td className="px-5 py-4">
                    {rec ? (
                      <span className={`text-sm font-medium ${rec.color}`}>
                        {rec.label}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {timeAgo(deal.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            No deals match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
