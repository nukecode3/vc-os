/**
 * Email Outreach Agent
 *
 * For every startup above the score threshold, drafts a personalized cold email
 * that references:
 * - A specific thing the founder said in a talk or essay
 * - A portfolio company that's adjacent to what they're building
 * - A concrete way you could add value
 *
 * Queues for review, sends via Gmail API, tracks open/reply rates,
 * and auto-follows up at day 3 and day 7.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AgentDefinition } from "../../types/agent.js";
import { TaskState, DealRecord } from "../../types/tool.js";
import { semanticSearch } from "../../services/vector/embeddings.js";
import { registerTask, updateTaskState } from "../../tasks/framework.js";
import type { DealScore } from "../intelligence/ratingEngine.js";

export const emailOutreachAgent: AgentDefinition = {
  agentType: "email_outreach",
  description: "Drafts and sends personalized cold outreach emails to scored startups",
  whenToUse: "When a deal crosses the score threshold and is ready for outreach",
  tools: ["web_scraper"],
  maxTurns: 10,
  model: "inherit",
  source: "built-in",

  getSystemPrompt(task: TaskState): string {
    return `You are the Email Outreach agent. Draft highly personalized cold emails
to startup founders that demonstrate genuine knowledge of their work.
Task: ${task.description}`;
  },
};

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface OutreachEmail {
  id: string;
  dealId: string;
  recipientName: string;
  recipientEmail?: string;
  subject: string;
  body: string;
  personalizations: string[];
  status: "draft" | "queued" | "sent" | "opened" | "replied" | "bounced";
  followUpDay: number; // 0 = initial, 3 = first follow-up, 7 = second
  sentAt?: Date;
  openedAt?: Date;
  repliedAt?: Date;
  createdAt: Date;
}

export interface OutreachCampaign {
  dealId: string;
  companyName: string;
  founderName: string;
  initialEmail: OutreachEmail;
  followUp3: OutreachEmail;
  followUp7: OutreachEmail;
  status: "drafting" | "review" | "active" | "replied" | "completed" | "stopped";
}

// -------------------------------------------------------------------
// Email Generation
// -------------------------------------------------------------------

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function generateOutreachCampaign(
  deal: DealRecord,
  dealScore: DealScore,
  senderName: string,
  senderFirm: string,
  getState: () => any,
  setState: (fn: (prev: any) => any) => void,
): Promise<OutreachCampaign> {
  const task = registerTask(
    "outreach_email",
    `Generate outreach: ${deal.companyName}`,
    getState,
    setState,
    deal.id,
  );
  updateTaskState(task.id, { status: "running" }, getState, setState);

  try {
    const founder = deal.founders[0];
    if (!founder) throw new Error("No founder data for outreach");

    // Find relevant context from vector store for personalization
    const founderContext = await semanticSearch(
      `${founder.name} ${founder.background || ""} ${deal.companyName}`,
      undefined,
      3,
    );

    const personalContext = founderContext
      .map((r) => r.text.slice(0, 300))
      .join("\n");

    // Find adjacent portfolio companies
    const adjacentCompanies = await semanticSearch(
      `${deal.sector} ${(deal.metadata as any)?.description || ""}`,
      "company",
      3,
    );

    const portfolioContext = adjacentCompanies
      .map((r) => `${r.metadata?.companyName || "Company"}: ${r.text.slice(0, 200)}`)
      .join("\n");

    // Generate all three emails
    const emailPrompt = `You are writing cold outreach emails from ${senderName} at ${senderFirm} (a VC firm) to ${founder.name}, founder of ${deal.companyName}.

DEAL CONTEXT:
Company: ${deal.companyName}
Sector: ${deal.sector}
Score: ${dealScore.compositeScore}/10
Bull case: ${dealScore.bullCase}
One-liner: ${dealScore.oneLiner}

FOUNDER:
${founder.name} (${founder.role})
Background: ${founder.background || "N/A"}
Education: ${founder.education?.join(", ") || "N/A"}

PERSONALIZATION CONTEXT (from our research):
${personalContext || "No specific context found"}

ADJACENT PORTFOLIO COMPANIES:
${portfolioContext || "None identified"}

COMPARABLE SUCCESSES:
${dealScore.comparables?.slice(0, 3).map((c) => `${c.name}: ${c.keyParallel}`).join("\n") || "None"}

Generate 3 emails as JSON:
{
  "initial": {
    "subject": "Short, specific subject line (NOT generic like 'quick question')",
    "body": "Personalized email. Reference something specific about the founder or company. Mention a relevant portfolio company. Offer concrete value. Keep under 150 words. No fluff.",
    "personalizations": ["specific thing referenced 1", "specific thing 2"]
  },
  "followUp3": {
    "subject": "Re: [initial subject]",
    "body": "Day 3 follow-up. Short (under 80 words). Add a new angle or piece of value. Don't just 'bump'.",
    "personalizations": ["new angle referenced"]
  },
  "followUp7": {
    "subject": "Re: [initial subject]",
    "body": "Day 7 final follow-up. Ultra short (under 50 words). Direct ask for a 15-min call. Mention one specific thing you could help with.",
    "personalizations": ["specific help offered"]
  }
}

Rules:
- Never use "I hope this finds you well" or "I came across your company"
- Lead with something specific you know about them
- The first sentence must prove you've done research
- Keep it conversational, not formal
- Output ONLY valid JSON`;

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: emailPrompt }],
    });

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse email generation response");

    const emails = JSON.parse(jsonMatch[0]);
    const now = new Date();

    const campaign: OutreachCampaign = {
      dealId: deal.id,
      companyName: deal.companyName,
      founderName: founder.name,
      initialEmail: {
        id: `email_${deal.id}_0`,
        dealId: deal.id,
        recipientName: founder.name,
        subject: emails.initial.subject,
        body: emails.initial.body,
        personalizations: emails.initial.personalizations,
        status: "draft",
        followUpDay: 0,
        createdAt: now,
      },
      followUp3: {
        id: `email_${deal.id}_3`,
        dealId: deal.id,
        recipientName: founder.name,
        subject: emails.followUp3.subject,
        body: emails.followUp3.body,
        personalizations: emails.followUp3.personalizations,
        status: "draft",
        followUpDay: 3,
        createdAt: now,
      },
      followUp7: {
        id: `email_${deal.id}_7`,
        dealId: deal.id,
        recipientName: founder.name,
        subject: emails.followUp7.subject,
        body: emails.followUp7.body,
        personalizations: emails.followUp7.personalizations,
        status: "draft",
        followUpDay: 7,
        createdAt: now,
      },
      status: "review",
    };

    // Update deal status
    setState((prev: any) => {
      const deals = new Map(prev.deals);
      const existing = deals.get(deal.id);
      if (existing) {
        deals.set(deal.id, { ...existing, status: "outreach", updatedAt: new Date() });
      }
      return { ...prev, deals };
    });

    updateTaskState(
      task.id,
      { status: "completed", output: JSON.stringify({ campaignId: deal.id }) },
      getState,
      setState,
    );

    return campaign;
  } catch (error) {
    updateTaskState(task.id, { status: "failed", output: String(error) }, getState, setState);
    throw error;
  }
}

// -------------------------------------------------------------------
// Gmail API Integration
// -------------------------------------------------------------------

export async function sendViaGmail(
  email: OutreachEmail,
  config: { gmailClientId?: string; gmailClientSecret?: string; gmailRefreshToken?: string },
): Promise<{ messageId: string; threadId: string } | null> {
  if (!config.gmailClientId || !config.gmailClientSecret || !config.gmailRefreshToken) {
    console.log(`[outreach] Gmail not configured — email queued as draft`);
    return null;
  }

  try {
    const { google } = await import("googleapis");
    const oauth2Client = new google.auth.OAuth2(
      config.gmailClientId,
      config.gmailClientSecret,
    );
    oauth2Client.setCredentials({ refresh_token: config.gmailRefreshToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Construct RFC 2822 email
    const rawEmail = [
      `To: ${email.recipientEmail || ""}`,
      `Subject: ${email.subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      email.body,
    ].join("\n");

    const encoded = Buffer.from(rawEmail).toString("base64url");

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encoded },
    });

    console.log(`[outreach] Sent email to ${email.recipientName}: ${result.data.id}`);
    return {
      messageId: result.data.id || "",
      threadId: result.data.threadId || "",
    };
  } catch (error) {
    console.error(`[outreach] Gmail send failed: ${error}`);
    return null;
  }
}

// -------------------------------------------------------------------
// Follow-up Scheduler
// -------------------------------------------------------------------

export function getEmailsDueForFollowUp(
  campaigns: OutreachCampaign[],
): Array<{ campaign: OutreachCampaign; email: OutreachEmail }> {
  const now = Date.now();
  const due: Array<{ campaign: OutreachCampaign; email: OutreachEmail }> = [];

  for (const campaign of campaigns) {
    if (campaign.status !== "active") continue;

    // Check day 3 follow-up
    if (
      campaign.initialEmail.status === "sent" &&
      campaign.followUp3.status === "queued" &&
      campaign.initialEmail.sentAt
    ) {
      const daysSinceSent = (now - campaign.initialEmail.sentAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceSent >= 3 && campaign.initialEmail.status !== "replied") {
        due.push({ campaign, email: campaign.followUp3 });
      }
    }

    // Check day 7 follow-up
    if (
      campaign.followUp3.status === "sent" &&
      campaign.followUp7.status === "queued" &&
      campaign.followUp3.sentAt
    ) {
      const daysSinceSent = (now - campaign.followUp3.sentAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceSent >= 4 && campaign.followUp3.status !== "replied") {
        due.push({ campaign, email: campaign.followUp7 });
      }
    }
  }

  return due;
}
