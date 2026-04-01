/**
 * VC-OS Main Entry Point
 *
 * Initializes the coordinator and provides a CLI interface for:
 * - Ingesting YC batches and VC portfolios
 * - Scoring deals
 * - Generating outreach
 * - Viewing deal pipeline status
 *
 * Usage:
 *   tsx src/main.ts                    # Start the coordinator (polling mode)
 *   tsx src/main.ts ingest-yc W25      # Ingest a specific YC batch
 *   tsx src/main.ts ingest-vc          # Ingest all VC portfolios
 *   tsx src/main.ts score <dealId>     # Score a specific deal
 *   tsx src/main.ts outreach <dealId>  # Generate outreach for a deal
 *   tsx src/main.ts status             # Show pipeline status
 *   tsx src/main.ts deals              # List all deals sorted by score
 */

import "dotenv/config";
import { Coordinator, CoordinatorConfig } from "./coordinator/coordinator.js";
import { AppConfig } from "./types/tool.js";

// -------------------------------------------------------------------
// Config from environment
// -------------------------------------------------------------------

function loadConfig(): CoordinatorConfig {
  const appConfig: AppConfig = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    databaseUrl: process.env.DATABASE_URL || "postgresql://localhost:5432/vc_os",
    proxycurlApiKey: process.env.PROXYCURL_API_KEY,
    crunchbaseApiKey: process.env.CRUNCHBASE_API_KEY,
    gmailClientId: process.env.GMAIL_CLIENT_ID,
    gmailClientSecret: process.env.GMAIL_CLIENT_SECRET,
    gmailRefreshToken: process.env.GMAIL_REFRESH_TOKEN,
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  };

  return {
    appConfig,
    scoreThreshold: parseFloat(process.env.SCORE_THRESHOLD || "6.5"),
    autoIngest: process.env.AUTO_INGEST === "true",
    autoOutreach: process.env.AUTO_OUTREACH === "true",
    senderName: process.env.SENDER_NAME || "VC-OS",
    senderFirm: process.env.SENDER_FIRM || "Your Fund",
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "60000"),
  };
}

// -------------------------------------------------------------------
// CLI
// -------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadConfig();
  const coordinator = new Coordinator(config);
  const args = process.argv.slice(2);
  const command = args[0] || "start";

  switch (command) {
    case "start": {
      console.log("VC-OS Starting...");
      console.log(`Score threshold: ${config.scoreThreshold}`);
      console.log(`Auto-ingest: ${config.autoIngest}`);
      console.log(`Auto-outreach: ${config.autoOutreach}`);
      console.log(`Poll interval: ${config.pollIntervalMs}ms`);
      console.log("");

      await coordinator.start();

      // Handle graceful shutdown
      process.on("SIGINT", () => {
        console.log("\nShutting down...");
        coordinator.stop();
        process.exit(0);
      });
      break;
    }

    case "ingest-yc": {
      const batch = args[1];
      await coordinator.initialize();
      await coordinator.ingestYCBatch(batch);
      break;
    }

    case "ingest-vc": {
      const firms = args.slice(1);
      await coordinator.initialize();
      await coordinator.ingestVCPortfolios(firms.length > 0 ? firms : undefined);
      break;
    }

    case "score": {
      const dealId = args[1];
      if (!dealId) {
        console.error("Usage: tsx src/main.ts score <dealId>");
        process.exit(1);
      }
      await coordinator.initialize();
      await coordinator.scoreDeal(dealId);
      break;
    }

    case "outreach": {
      const dealId = args[1];
      if (!dealId) {
        console.error("Usage: tsx src/main.ts outreach <dealId>");
        process.exit(1);
      }
      await coordinator.initialize();
      await coordinator.generateOutreach(dealId);
      break;
    }

    case "status": {
      const status = coordinator.getStatus();
      console.log("\n--- VC-OS Status ---");
      console.log(`Running: ${status.running}`);
      console.log(`Deals: ${status.deals.total}`);
      for (const [s, count] of Object.entries(status.deals.byStatus)) {
        console.log(`  ${s}: ${count}`);
      }
      console.log(`Tasks: ${status.tasks.total}`);
      for (const [s, count] of Object.entries(status.tasks.byStatus)) {
        console.log(`  ${s}: ${count}`);
      }
      console.log(`Agents: ${status.agents.total} (${status.agents.active} active)`);
      break;
    }

    case "deals": {
      const deals = coordinator.getDeals();
      if (deals.length === 0) {
        console.log("No deals in pipeline. Run 'ingest-yc' or 'ingest-vc' first.");
        break;
      }
      console.log("\n--- Deal Pipeline ---");
      console.log(
        `${"Company".padEnd(25)} ${"Sector".padEnd(20)} ${"Stage".padEnd(12)} ${"Score".padEnd(8)} Status`,
      );
      console.log("-".repeat(80));
      for (const deal of deals) {
        console.log(
          `${deal.companyName.padEnd(25)} ${deal.sector.padEnd(20)} ${deal.stage.padEnd(12)} ${(deal.score?.toFixed(1) || "—").padEnd(8)} ${deal.status}`,
        );
      }
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log("Commands: start, ingest-yc, ingest-vc, score, outreach, status, deals");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
