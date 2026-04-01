/**
 * Mock data for the web dashboard.
 * In production, this would come from the coordinator's state via API routes.
 */

export interface Deal {
  id: string;
  companyName: string;
  sector: string;
  stage: string;
  status: "discovered" | "researching" | "scored" | "outreach" | "passed" | "pursuing";
  score: number | null;
  teamScore: number | null;
  marketScore: number | null;
  tractionScore: number | null;
  deckScore: number | null;
  recommendation: string | null;
  bullCase: string | null;
  bearCase: string | null;
  oneLiner: string | null;
  founders: Founder[];
  source: string;
  batch?: string;
  comparables: Comparable[];
  createdAt: string;
  updatedAt: string;
}

export interface Founder {
  name: string;
  role: string;
  background: string;
  linkedinUrl?: string;
  githubUrl?: string;
  technicalDepth: number;
  executionVelocity: number;
  domainExpertise: number;
  networkScore: number;
  archetypeMatch?: string | null;
  pgPattern?: string | null;
}

export interface Comparable {
  name: string;
  outcome: string;
  similarity: number;
  keyParallel: string;
}

export interface PipelineStats {
  totalDeals: number;
  discovered: number;
  researching: number;
  scored: number;
  outreach: number;
  pursuing: number;
  passed: number;
  avgScore: number;
  topSector: string;
  agentsActive: number;
  tasksRunning: number;
  tasksCompleted: number;
}

export interface OutreachCampaign {
  id: string;
  dealId: string;
  companyName: string;
  founderName: string;
  status: "draft" | "review" | "active" | "replied" | "completed";
  initialEmail: { subject: string; body: string; status: string; sentAt?: string };
  followUp3: { subject: string; body: string; status: string; sentAt?: string };
  followUp7: { subject: string; body: string; status: string; sentAt?: string };
  createdAt: string;
}

export const mockDeals: Deal[] = [
  {
    id: "d1",
    companyName: "NeuralForge",
    sector: "AI / Developer Tools",
    stage: "Seed",
    status: "scored",
    score: 8.2,
    teamScore: 9,
    marketScore: 8,
    tractionScore: 7,
    deckScore: 8,
    recommendation: "strong_interest",
    bullCase: "Exceptional technical founders with deep ML infrastructure experience. TAM is massive ($40B+ by 2028) and they have a clear wedge — LLM fine-tuning for enterprise. Early traction with 3 Fortune 500 design partners shows product-market fit emerging. First-mover in the fine-tuning infrastructure layer.",
    bearCase: "Crowded space with well-funded competitors (Together AI, Anyscale). Margins could compress as cloud providers build native fine-tuning. Both founders are first-time CEOs — leadership gaps may emerge at scale.",
    oneLiner: "Enterprise LLM fine-tuning platform that reduces model customization time from weeks to hours.",
    founders: [
      { name: "Sarah Chen", role: "CEO", background: "Ex-Google Brain research scientist. 8 years in ML infrastructure. Published 12 papers on efficient fine-tuning. Stanford CS PhD.", linkedinUrl: "https://linkedin.com/in/sarachen", githubUrl: "https://github.com/sarachen", technicalDepth: 9, executionVelocity: 7, domainExpertise: 9, networkScore: 8, archetypeMatch: "Resembles Alexandr Wang (Scale AI) — deep technical ML background, saw infrastructure bottleneck before others", pgPattern: "Frighteningly Ambitious Startup Ideas" },
      { name: "Marcus Johnson", role: "CTO", background: "Ex-Meta AI infra. Built distributed training systems serving 10K+ researchers. MIT CS.", linkedinUrl: "https://linkedin.com/in/marcusj", githubUrl: "https://github.com/marcusj", technicalDepth: 10, executionVelocity: 8, domainExpertise: 8, networkScore: 7, archetypeMatch: "Resembles Patrick Collison (Stripe) — builder mentality, infrastructure-level thinking" },
    ],
    source: "YC",
    batch: "W25",
    comparables: [
      { name: "Scale AI", outcome: "unicorn ($7.3B)", similarity: 0.82, keyParallel: "ML infrastructure bottleneck play, strong technical founder" },
      { name: "Stripe", outcome: "decacorn ($95B)", similarity: 0.71, keyParallel: "Developer experience for a painful infrastructure problem" },
    ],
    createdAt: "2026-03-28T10:00:00Z",
    updatedAt: "2026-03-30T14:00:00Z",
  },
  {
    id: "d2",
    companyName: "GreenLedger",
    sector: "Climate / Fintech",
    stage: "Pre-seed",
    status: "scored",
    score: 7.1,
    teamScore: 7,
    marketScore: 8,
    tractionScore: 6,
    deckScore: 7,
    recommendation: "interested",
    bullCase: "Regulatory tailwinds (SEC climate disclosure rules) create mandatory demand. Carbon accounting is a greenfield $10B+ market. Founder has unique domain expertise from 6 years at EPA.",
    bearCase: "Pre-revenue with no LOIs. Technical co-founder needed. Competing with Persefoni ($100M+ raised) and Watershed ($70M raised) — late to a fast-moving market.",
    oneLiner: "Automated carbon accounting platform for mid-market companies facing new SEC disclosure requirements.",
    founders: [
      { name: "Diana Torres", role: "CEO / Solo Founder", background: "6 years at EPA, led corporate emissions reporting division. MBA from Wharton.", technicalDepth: 3, executionVelocity: 6, domainExpertise: 9, networkScore: 7, archetypeMatch: "Resembles Tony Xu (DoorDash) — deep domain expertise from personal experience", pgPattern: "Schlep Blindness" },
    ],
    source: "a16z network",
    comparables: [
      { name: "DoorDash", outcome: "decacorn ($72B IPO)", similarity: 0.65, keyParallel: "Domain expert tackling unglamorous but massive problem" },
    ],
    createdAt: "2026-03-27T08:00:00Z",
    updatedAt: "2026-03-30T11:00:00Z",
  },
  {
    id: "d3",
    companyName: "Meshwork",
    sector: "Enterprise / Collaboration",
    stage: "Seed",
    status: "outreach",
    score: 7.8,
    teamScore: 8,
    marketScore: 7,
    tractionScore: 8,
    deckScore: 8,
    recommendation: "interested",
    bullCase: "Strong early traction — $40K MRR after 4 months. Slack replacement for async-first teams is a wedge into a $20B market. Both founders previously built and sold a dev tools company.",
    bearCase: "Competing with Slack, Notion, and Linear simultaneously. Feature scope creep risk. Previous exit was acqui-hire, not a clear product win.",
    oneLiner: "Async-first team workspace replacing Slack + Notion for remote engineering teams.",
    founders: [
      { name: "Alex Rivera", role: "CEO", background: "Previously co-founded DevSync (acquired by Atlassian). 10 years in developer tools.", technicalDepth: 7, executionVelocity: 9, domainExpertise: 8, networkScore: 8, archetypeMatch: "Resembles Ivan Zhao (Notion) — craft-obsessed builder of productivity tools", pgPattern: "Do Things That Don't Scale" },
      { name: "Jamie Park", role: "CTO", background: "Ex-Slack infrastructure engineer. Led real-time messaging team. Berkeley CS.", technicalDepth: 9, executionVelocity: 8, domainExpertise: 7, networkScore: 6, archetypeMatch: "Resembles Drew Houston (Dropbox) — deep technical skill applied to a ubiquitous frustration" },
    ],
    source: "Sequoia scout",
    comparables: [
      { name: "Notion", outcome: "unicorn ($10B)", similarity: 0.78, keyParallel: "Craft-driven productivity tool with strong early community" },
      { name: "Figma", outcome: "unicorn ($20B)", similarity: 0.69, keyParallel: "Multiplayer-native tool replacing desktop incumbent" },
    ],
    createdAt: "2026-03-25T14:00:00Z",
    updatedAt: "2026-03-31T09:00:00Z",
  },
  {
    id: "d4",
    companyName: "QuantumShield",
    sector: "Cybersecurity",
    stage: "Series A",
    status: "researching",
    score: null,
    teamScore: null,
    marketScore: null,
    tractionScore: null,
    deckScore: null,
    recommendation: null,
    bullCase: null,
    bearCase: null,
    oneLiner: "Post-quantum cryptography migration platform for financial institutions.",
    founders: [
      { name: "Raj Patel", role: "CEO", background: "Ex-NSA cryptographer, 15 years in cybersecurity.", technicalDepth: 10, executionVelocity: 5, domainExpertise: 10, networkScore: 9, archetypeMatch: null, pgPattern: null },
    ],
    source: "Founders Fund",
    comparables: [],
    createdAt: "2026-03-30T16:00:00Z",
    updatedAt: "2026-03-30T16:00:00Z",
  },
  {
    id: "d5",
    companyName: "FarmStack",
    sector: "AgTech / SaaS",
    stage: "Seed",
    status: "passed",
    score: 4.2,
    teamScore: 5,
    marketScore: 4,
    tractionScore: 3,
    deckScore: 5,
    recommendation: "pass",
    bullCase: "Large addressable market in agricultural software. Founders have farming background.",
    bearCase: "No technical co-founder, weak traction after 8 months, and the market moves slowly with long sales cycles. Competing against established players like Granular (acquired by Corteva).",
    oneLiner: "Farm management SaaS for mid-size agricultural operations.",
    founders: [
      { name: "Tom Baker", role: "CEO", background: "Third-generation farmer, MBA from Iowa State.", technicalDepth: 2, executionVelocity: 4, domainExpertise: 8, networkScore: 3, archetypeMatch: null, pgPattern: null },
    ],
    source: "YC",
    batch: "S24",
    comparables: [],
    createdAt: "2026-03-20T10:00:00Z",
    updatedAt: "2026-03-28T10:00:00Z",
  },
  {
    id: "d6",
    companyName: "Pixelflow",
    sector: "Creative Tools / AI",
    stage: "Pre-seed",
    status: "discovered",
    score: null,
    teamScore: null,
    marketScore: null,
    tractionScore: null,
    deckScore: null,
    recommendation: null,
    bullCase: null,
    bearCase: null,
    oneLiner: "AI-native video editing platform for social media creators.",
    founders: [
      { name: "Mia Zhang", role: "CEO", background: "Ex-TikTok product manager, 5 years in creator tools.", technicalDepth: 5, executionVelocity: 7, domainExpertise: 7, networkScore: 6, archetypeMatch: null, pgPattern: null },
    ],
    source: "YC",
    batch: "W25",
    comparables: [],
    createdAt: "2026-03-31T08:00:00Z",
    updatedAt: "2026-03-31T08:00:00Z",
  },
];

export const mockStats: PipelineStats = {
  totalDeals: mockDeals.length,
  discovered: mockDeals.filter((d) => d.status === "discovered").length,
  researching: mockDeals.filter((d) => d.status === "researching").length,
  scored: mockDeals.filter((d) => d.status === "scored").length,
  outreach: mockDeals.filter((d) => d.status === "outreach").length,
  pursuing: mockDeals.filter((d) => d.status === "pursuing").length,
  passed: mockDeals.filter((d) => d.status === "passed").length,
  avgScore: +(mockDeals.filter((d) => d.score).reduce((s, d) => s + (d.score || 0), 0) / mockDeals.filter((d) => d.score).length).toFixed(1),
  topSector: "AI / Developer Tools",
  agentsActive: 2,
  tasksRunning: 3,
  tasksCompleted: 47,
};

export const mockCampaigns: OutreachCampaign[] = [
  {
    id: "c1",
    dealId: "d3",
    companyName: "Meshwork",
    founderName: "Alex Rivera",
    status: "active",
    initialEmail: {
      subject: "Your DevSync exit and what you're building at Meshwork",
      body: "Alex — I watched your talk at Dev Day about async-first collaboration and it crystallized something I've been thinking about. The Slack fatigue in engineering teams is real, and your experience building DevSync (and seeing the Atlassian integration challenges firsthand) gives you a unique lens on this.\n\nWe backed a company in a similar wedge play (sync → async migration) and I'd love to share what we learned about enterprise adoption patterns. Would 15 minutes be useful?",
      status: "sent",
      sentAt: "2026-03-29T10:00:00Z",
    },
    followUp3: {
      subject: "Re: Your DevSync exit and what you're building at Meshwork",
      body: "Quick follow-up — I noticed you just shipped the Linear integration. Smart move. Our portfolio company saw 3x activation rates after adding workflow integrations. Happy to intro you to their head of partnerships if helpful.",
      status: "queued",
    },
    followUp7: {
      subject: "Re: Your DevSync exit and what you're building at Meshwork",
      body: "Last note — we're hosting a dinner for async-first founders next Thursday. Would love to have you. 15 min call to see if there's a fit?",
      status: "queued",
    },
    createdAt: "2026-03-29T09:00:00Z",
  },
];

export function getDeal(id: string): Deal | undefined {
  return mockDeals.find((d) => d.id === id);
}
