"use client";

import { useState } from "react";
import { Mail, Send, Clock, CheckCircle, Eye, MessageCircle } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { mockCampaigns } from "@/lib/mock-data";
import { cn, timeAgo } from "@/lib/utils";

export default function OutreachPage() {
  const [selectedCampaign, setSelectedCampaign] = useState(mockCampaigns[0]?.id);

  const campaign = mockCampaigns.find((c) => c.id === selectedCampaign);

  const emailStatusIcon = (status: string) => {
    switch (status) {
      case "sent": return <Send className="w-3.5 h-3.5 text-blue-400" />;
      case "opened": return <Eye className="w-3.5 h-3.5 text-amber-400" />;
      case "replied": return <MessageCircle className="w-3.5 h-3.5 text-green-400" />;
      case "queued": return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
      case "draft": return <Mail className="w-3.5 h-3.5 text-muted-foreground" />;
      default: return <Mail className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Outreach</h1>
        <p className="text-muted-foreground mt-1">
          {mockCampaigns.length} active campaigns
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Campaign List */}
        <div className="bg-card border border-border rounded-xl">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-sm">Campaigns</h2>
          </div>
          <div className="divide-y divide-border">
            {mockCampaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCampaign(c.id)}
                className={cn(
                  "w-full text-left p-4 transition-colors",
                  selectedCampaign === c.id
                    ? "bg-accent/10"
                    : "hover:bg-muted/30"
                )}
              >
                <div className="font-medium text-sm">{c.companyName}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {c.founderName} · {c.status}
                </div>
              </button>
            ))}
            {mockCampaigns.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No campaigns yet. Score deals above threshold to auto-generate outreach.
              </div>
            )}
          </div>
        </div>

        {/* Email Detail */}
        <div className="col-span-2 space-y-4">
          {campaign ? (
            <>
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold">{campaign.companyName}</h2>
                    <p className="text-sm text-muted-foreground">
                      To: {campaign.founderName}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs hover:bg-muted/50">
                      Edit
                    </button>
                    <button className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent/80">
                      Approve & Send
                    </button>
                  </div>
                </div>

                {/* Email timeline */}
                <div className="space-y-4">
                  {[
                    { label: "Initial Email", email: campaign.initialEmail, day: "Day 0" },
                    { label: "Follow-up #1", email: campaign.followUp3, day: "Day 3" },
                    { label: "Follow-up #2", email: campaign.followUp7, day: "Day 7" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="border border-border rounded-lg overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20 border-b border-border">
                        <div className="flex items-center gap-2">
                          {emailStatusIcon(item.email.status)}
                          <span className="text-sm font-medium">{item.label}</span>
                          <span className="text-xs text-muted-foreground">
                            ({item.day})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-xs capitalize px-2 py-0.5 rounded-full",
                              item.email.status === "sent"
                                ? "bg-blue-500/10 text-blue-400"
                                : item.email.status === "queued"
                                  ? "bg-zinc-500/10 text-zinc-400"
                                  : "bg-zinc-500/10 text-zinc-400"
                            )}
                          >
                            {item.email.status}
                          </span>
                          {item.email.sentAt && (
                            <span className="text-xs text-muted-foreground">
                              {timeAgo(item.email.sentAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="text-sm font-medium mb-2">
                          {item.email.subject}
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {item.email.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
              Select a campaign to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
