"use client";

import { useState } from "react";
import { Save, Play, RefreshCw } from "lucide-react";

export default function SettingsPage() {
  const [config, setConfig] = useState({
    scoreThreshold: "6.5",
    autoIngest: false,
    autoOutreach: false,
    senderName: "",
    senderFirm: "",
    pollInterval: "60",
    anthropicApiKey: "",
    databaseUrl: "postgresql://localhost:5432/vc_os",
    proxycurlApiKey: "",
    crunchbaseApiKey: "",
    slackWebhookUrl: "",
  });

  const [saved, setSaved] = useState(false);

  function handleSave() {
    // In production, this would POST to /api/settings
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure the VC-OS coordinator and agent pipeline
        </p>
      </div>

      {/* Coordinator Settings */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold">Coordinator</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">
              Score Threshold
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={config.scoreThreshold}
              onChange={(e) => setConfig({ ...config, scoreThreshold: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Deals above this score trigger outreach
            </p>
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">
              Poll Interval (seconds)
            </label>
            <input
              type="number"
              value={config.pollInterval}
              onChange={(e) => setConfig({ ...config, pollInterval: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">
              Sender Name
            </label>
            <input
              type="text"
              placeholder="Your Name"
              value={config.senderName}
              onChange={(e) => setConfig({ ...config, senderName: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">
              Fund Name
            </label>
            <input
              type="text"
              placeholder="Your Fund"
              value={config.senderFirm}
              onChange={(e) => setConfig({ ...config, senderFirm: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoIngest}
              onChange={(e) => setConfig({ ...config, autoIngest: e.target.checked })}
              className="w-4 h-4 rounded accent-accent"
            />
            <span className="text-sm">Auto-ingest new YC batches</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoOutreach}
              onChange={(e) => setConfig({ ...config, autoOutreach: e.target.checked })}
              className="w-4 h-4 rounded accent-accent"
            />
            <span className="text-sm">Auto-generate outreach</span>
          </label>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold">API Keys & Connections</h2>

        {[
          { key: "anthropicApiKey", label: "Anthropic API Key", placeholder: "sk-ant-..." },
          { key: "databaseUrl", label: "Database URL", placeholder: "postgresql://..." },
          { key: "proxycurlApiKey", label: "Proxycurl API Key", placeholder: "API key for LinkedIn data" },
          { key: "crunchbaseApiKey", label: "Crunchbase API Key", placeholder: "API key for funding data" },
          { key: "slackWebhookUrl", label: "Slack Webhook URL", placeholder: "https://hooks.slack.com/..." },
        ].map((field) => (
          <div key={field.key}>
            <label className="block text-sm text-muted-foreground mb-1.5">
              {field.label}
            </label>
            <input
              type={field.key.includes("Key") || field.key.includes("Url") ? "password" : "text"}
              placeholder={field.placeholder}
              value={config[field.key as keyof typeof config] as string}
              onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saved ? "Saved!" : "Save Settings"}
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border rounded-lg text-sm font-medium hover:bg-muted/50 transition-colors">
          <Play className="w-4 h-4" />
          Start Coordinator
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border rounded-lg text-sm font-medium hover:bg-muted/50 transition-colors">
          <RefreshCw className="w-4 h-4" />
          Seed Vector Stores
        </button>
      </div>
    </div>
  );
}
