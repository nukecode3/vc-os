/**
 * Founder Profile Agent
 *
 * For each startup, builds a structured founder profile by pulling:
 * - LinkedIn (via Proxycurl API)
 * - GitHub activity (public API)
 * - Twitter/X profile
 * - Conference talks on YouTube
 *
 * Synthesizes into a typed FounderProfile for downstream archetype matching.
 */

import { AgentDefinition } from "../../types/agent.js";
import { TaskState, FounderProfile, AppConfig } from "../../types/tool.js";
import { apiClientTool } from "../../tools/apiClient.js";
import { webScraperTool } from "../../tools/webScraper.js";
import { registerTask, updateTaskState } from "../../tasks/framework.js";

export const founderProfileAgent: AgentDefinition = {
  agentType: "founder_profile",
  description: "Builds structured founder profiles from LinkedIn, GitHub, Twitter, YouTube",
  whenToUse: "When enriching founder data for a specific deal or batch of companies",
  tools: ["api_client", "web_scraper"],
  maxTurns: 30,
  model: "inherit",
  source: "built-in",

  getSystemPrompt(task: TaskState): string {
    return `You are the Founder Profile agent. Build comprehensive founder profiles by pulling
data from LinkedIn, GitHub, Twitter, and YouTube. Synthesize into a structured profile
with: skill gaps, domain expertise score, execution velocity signals.
Task: ${task.description}`;
  },
};

// -------------------------------------------------------------------
// LinkedIn via Proxycurl
// -------------------------------------------------------------------

interface LinkedInProfile {
  fullName: string;
  headline: string;
  summary: string;
  experiences: Array<{
    title: string;
    company: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  education: Array<{
    school: string;
    degree?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
  }>;
  skills: string[];
}

async function fetchLinkedInProfile(
  linkedinUrl: string,
  config: AppConfig,
): Promise<LinkedInProfile | null> {
  if (!config.proxycurlApiKey) {
    console.log("[founder] Skipping LinkedIn — no Proxycurl API key");
    return null;
  }

  const result = await apiClientTool.execute(
    {
      service: "proxycurl",
      endpoint: "/linkedin",
      params: { url: linkedinUrl },
    },
    { config } as any,
  );

  if (result.error || result.data.status !== 200) return null;

  const data = result.data.data as any;
  return {
    fullName: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
    headline: data.headline || "",
    summary: data.summary || "",
    experiences: (data.experiences || []).map((e: any) => ({
      title: e.title,
      company: e.company,
      startDate: e.starts_at ? `${e.starts_at.year}-${e.starts_at.month}` : undefined,
      endDate: e.ends_at ? `${e.ends_at.year}-${e.ends_at.month}` : "Present",
      description: e.description,
    })),
    education: (data.education || []).map((e: any) => ({
      school: e.school,
      degree: e.degree_name,
      fieldOfStudy: e.field_of_study,
    })),
    skills: data.skills || [],
  };
}

// -------------------------------------------------------------------
// GitHub Activity
// -------------------------------------------------------------------

interface GitHubProfile {
  username: string;
  bio?: string;
  publicRepos: number;
  followers: number;
  topLanguages: string[];
  recentCommitFrequency: number; // commits per week (last 12 weeks)
  notableRepos: Array<{
    name: string;
    stars: number;
    description?: string;
    language?: string;
  }>;
}

async function fetchGitHubProfile(githubUrl: string): Promise<GitHubProfile | null> {
  const username = githubUrl.replace(/\/$/, "").split("/").pop();
  if (!username) return null;

  // Fetch user profile
  const profileResult = await apiClientTool.execute(
    { service: "github", endpoint: `/users/${username}` },
    {} as any,
  );

  if (profileResult.error || profileResult.data.status !== 200) return null;
  const user = profileResult.data.data as any;

  // Fetch repos sorted by stars
  const reposResult = await apiClientTool.execute(
    {
      service: "github",
      endpoint: `/users/${username}/repos`,
      params: { sort: "stars", per_page: "10", direction: "desc" },
    },
    {} as any,
  );

  const repos = reposResult.error ? [] : ((reposResult.data.data as any[]) || []);

  // Fetch recent commit activity
  const eventsResult = await apiClientTool.execute(
    {
      service: "github",
      endpoint: `/users/${username}/events`,
      params: { per_page: "100" },
    },
    {} as any,
  );

  const events = eventsResult.error ? [] : ((eventsResult.data.data as any[]) || []);
  const pushEvents = events.filter((e: any) => e.type === "PushEvent");
  const twelveWeeksAgo = Date.now() - 12 * 7 * 24 * 60 * 60 * 1000;
  const recentPushes = pushEvents.filter(
    (e: any) => new Date(e.created_at).getTime() > twelveWeeksAgo,
  );

  // Count languages across repos
  const langCount: Record<string, number> = {};
  for (const repo of repos) {
    if (repo.language) {
      langCount[repo.language] = (langCount[repo.language] || 0) + repo.stargazers_count + 1;
    }
  }
  const topLanguages = Object.entries(langCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([lang]) => lang);

  return {
    username,
    bio: user.bio,
    publicRepos: user.public_repos,
    followers: user.followers,
    topLanguages,
    recentCommitFrequency: Math.round(recentPushes.length / 12),
    notableRepos: repos.slice(0, 5).map((r: any) => ({
      name: r.name,
      stars: r.stargazers_count,
      description: r.description,
      language: r.language,
    })),
  };
}

// -------------------------------------------------------------------
// Twitter/X Profile (basic scrape)
// -------------------------------------------------------------------

interface TwitterProfile {
  handle: string;
  bio?: string;
  followers?: number;
  recentTopics: string[];
}

async function fetchTwitterProfile(twitterUrl: string): Promise<TwitterProfile | null> {
  const handle = twitterUrl.replace(/\/$/, "").split("/").pop();
  if (!handle) return null;

  // Basic scrape — X requires auth for most data, so we get what we can
  const result = await webScraperTool.execute(
    {
      url: `https://nitter.net/${handle}`,
      selectors: {
        bio: ".profile-bio",
        stats: ".profile-stat-num",
        tweets: ".tweet-content",
      },
    },
    {} as any,
  );

  if (result.error) return null;

  const tweets = result.data.extracted["tweets"] || [];
  // Extract rough topics from recent tweets
  const recentTopics = extractTopics(tweets.join(" "));

  return {
    handle: handle.replace("@", ""),
    bio: result.data.extracted["bio"]?.[0],
    followers: parseInt(result.data.extracted["stats"]?.[0] || "0") || undefined,
    recentTopics,
  };
}

function extractTopics(text: string): string[] {
  const hashtags = text.match(/#\w+/g) || [];
  const unique = [...new Set(hashtags.map((h) => h.toLowerCase()))];
  return unique.slice(0, 10);
}

// -------------------------------------------------------------------
// Profile Synthesis
// -------------------------------------------------------------------

export interface EnrichedFounderProfile extends FounderProfile {
  linkedin?: LinkedInProfile;
  github?: GitHubProfile;
  twitter?: TwitterProfile;
  domainExpertiseYears: number;
  technicalDepthScore: number; // 0-10
  executionVelocityScore: number; // 0-10
  networkScore: number; // 0-10
}

function calculateDomainExpertise(linkedin: LinkedInProfile | null, sector: string): number {
  if (!linkedin) return 0;

  let years = 0;
  for (const exp of linkedin.experiences) {
    if (!exp.startDate) continue;
    const start = new Date(exp.startDate);
    const end = exp.endDate === "Present" ? new Date() : new Date(exp.endDate || "");
    const duration = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

    // Check if role is in the same sector (rough heuristic)
    const relevantKeywords = sector.toLowerCase().split(/\s+/);
    const roleText = `${exp.title} ${exp.company} ${exp.description || ""}`.toLowerCase();
    if (relevantKeywords.some((k) => roleText.includes(k))) {
      years += Math.max(0, duration);
    }
  }

  return Math.round(years * 10) / 10;
}

function calculateTechnicalDepth(github: GitHubProfile | null): number {
  if (!github) return 0;

  let score = 0;
  score += Math.min(3, github.publicRepos / 10); // Repos: up to 3
  score += Math.min(2, github.followers / 100); // Followers: up to 2
  score += Math.min(2, github.recentCommitFrequency / 5); // Activity: up to 2
  score += Math.min(2, github.notableRepos.reduce((s, r) => s + r.stars, 0) / 500); // Stars: up to 2
  score += github.topLanguages.length >= 3 ? 1 : 0; // Polyglot: up to 1

  return Math.min(10, Math.round(score * 10) / 10);
}

function calculateExecutionVelocity(
  github: GitHubProfile | null,
  linkedin: LinkedInProfile | null,
): number {
  let score = 0;

  if (github) {
    score += Math.min(4, github.recentCommitFrequency); // Recent coding activity
  }

  if (linkedin) {
    // Count number of roles (more roles = more execution experience)
    score += Math.min(3, linkedin.experiences.length / 2);

    // Bonus for prior startup experience
    const startupKeywords = ["founder", "co-founder", "cto", "ceo", "startup"];
    const hasStartupExp = linkedin.experiences.some((e) =>
      startupKeywords.some((k) => e.title.toLowerCase().includes(k)),
    );
    if (hasStartupExp) score += 2;

    // Bonus for exits
    const exitKeywords = ["acquired", "acquisition", "ipo", "exit"];
    const hasExit = linkedin.experiences.some(
      (e) =>
        e.description &&
        exitKeywords.some((k) => e.description!.toLowerCase().includes(k)),
    );
    if (hasExit) score += 1;
  }

  return Math.min(10, Math.round(score * 10) / 10);
}

function calculateNetworkScore(
  linkedin: LinkedInProfile | null,
  github: GitHubProfile | null,
  twitter: TwitterProfile | null,
): number {
  let score = 0;

  if (linkedin) {
    // Education pedigree signal
    const topSchools = [
      "stanford", "mit", "harvard", "yale", "princeton", "caltech",
      "berkeley", "carnegie mellon", "georgia tech", "waterloo",
    ];
    const hasTopSchool = linkedin.education.some((e) =>
      topSchools.some((s) => e.school.toLowerCase().includes(s)),
    );
    if (hasTopSchool) score += 3;

    // Big tech pedigree
    const bigTech = ["google", "meta", "facebook", "apple", "amazon", "microsoft", "stripe", "airbnb"];
    const hasBigTech = linkedin.experiences.some((e) =>
      bigTech.some((c) => e.company.toLowerCase().includes(c)),
    );
    if (hasBigTech) score += 2;
  }

  if (github && github.followers > 100) score += 2;
  if (twitter && (twitter.followers || 0) > 1000) score += 2;

  return Math.min(10, Math.round(score * 10) / 10);
}

// -------------------------------------------------------------------
// Orchestration
// -------------------------------------------------------------------

export async function enrichFounderProfile(
  founder: FounderProfile,
  sector: string,
  config: AppConfig,
): Promise<EnrichedFounderProfile> {
  console.log(`[founder] Enriching profile: ${founder.name}`);

  // Fetch all data sources in parallel where possible
  const [linkedin, github, twitter] = await Promise.all([
    founder.linkedinUrl ? fetchLinkedInProfile(founder.linkedinUrl, config) : null,
    founder.githubUrl ? fetchGitHubProfile(founder.githubUrl) : null,
    founder.twitterUrl ? fetchTwitterProfile(founder.twitterUrl) : null,
  ]);

  const domainExpertiseYears = calculateDomainExpertise(linkedin, sector);
  const technicalDepthScore = calculateTechnicalDepth(github);
  const executionVelocityScore = calculateExecutionVelocity(github, linkedin);
  const networkScore = calculateNetworkScore(linkedin, github, twitter);

  return {
    ...founder,
    linkedin: linkedin || undefined,
    github: github || undefined,
    twitter: twitter || undefined,
    domainExpertiseYears,
    technicalDepthScore,
    executionVelocityScore,
    networkScore,
    background: linkedin?.summary || founder.background,
    education: linkedin?.education.map((e) => `${e.degree || ""} ${e.school}`.trim()),
    priorExits: linkedin?.experiences
      .filter((e) => e.description?.toLowerCase().includes("acquired"))
      .map((e) => e.company),
  };
}

export async function runFounderIngestion(
  founders: Array<{ founder: FounderProfile; sector: string; dealId: string }>,
  getState: () => any,
  setState: (fn: (prev: any) => any) => void,
): Promise<EnrichedFounderProfile[]> {
  const task = registerTask(
    "ingest_founder",
    `Enrich ${founders.length} founder profiles`,
    getState,
    setState,
  );
  updateTaskState(task.id, { status: "running" }, getState, setState);

  const enriched: EnrichedFounderProfile[] = [];

  try {
    const config = getState().config;

    for (const { founder, sector, dealId } of founders) {
      const profile = await enrichFounderProfile(founder, sector, config);
      enriched.push(profile);

      // Update the deal record with enriched founder
      setState((prev: any) => {
        const deals = new Map(prev.deals);
        const deal = deals.get(dealId);
        if (deal) {
          const updatedFounders = deal.founders.map((f: FounderProfile) =>
            f.name === founder.name ? profile : f,
          );
          deals.set(dealId, { ...deal, founders: updatedFounders, updatedAt: new Date() });
        }
        return { ...prev, deals };
      });

      await delay(500); // Rate limit
    }

    updateTaskState(
      task.id,
      { status: "completed", output: JSON.stringify({ count: enriched.length }) },
      getState,
      setState,
    );
  } catch (error) {
    updateTaskState(task.id, { status: "failed", output: String(error) }, getState, setState);
    throw error;
  }

  return enriched;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
