# VC Operating System — Build Instructions

## What This Is

A **VC Operating System** — a multi-agent pipeline for venture capital deal sourcing, founder analysis, and automated outreach. Built on the same architectural patterns as Claude Code's multi-agent system: a coordinator spawning specialized sub-agents, each with its own context, tools, and task state persisted to disk.

---

## The Five Layers

### Layer 1 — Data Ingestion Agents

Each agent is a standalone worker with one job:

1. **YC Portfolio Agent** (`src/agents/ingestion/ycScraper.ts`)
   - Scrapes `ycombinator.com/companies` for company listings
   - Pulls funding rounds from Crunchbase API
   - Scrapes YC YouTube channel transcripts via `yt-dlp`
   - Scrapes all 200+ Paul Graham essays from `paulgraham.com` for semantic embedding

2. **VC Portfolio Agent** (`src/agents/ingestion/vcPortfolio.ts`)
   - Scrapes a16z, Sequoia, Founders Fund, Benchmark, Accel portfolio pages
   - Cross-references with Crunchbase for funding history
   - Detects new portfolio additions on weekly schedule

3. **Founder Profile Agent** (`src/agents/ingestion/founderProfile.ts`)
   - LinkedIn profiles via Proxycurl API
   - GitHub activity via public API (commit frequency, top languages, stars)
   - Twitter/X profile scraping
   - Conference talk transcripts from YouTube
   - Synthesizes into structured profile with scoring (technical depth, execution velocity, network)

4. **Deck Scraper Agent** (planned)
   - Public SlideShare/Speaker Deck decks
   - Docsend links that are publicly shared
   - PDF attachments from press releases
   - Deck summaries from TechCrunch, The Information

### Layer 2 — Vector Knowledge Base

Two vector indexes powered by pgvector:

1. **Success Pattern Index**
   - Every YC company (W01–W25) that hit $100M+ gets embedded
   - Every a16z and Sequoia unicorn gets embedded
   - Enables nearest-neighbor search: "which successful companies does this most resemble at seed stage?"

2. **Founder Archetype Store**
   - Embed all winning founder profiles
   - Vectors encode: technical depth, prior exits, domain expertise years, school pedigree, co-founder relationship history
   - Query: "This founder most resembles Brian Chesky at pre-seed Airbnb"

3. **PG Essay Semantic Index**
   - All 200+ Paul Graham essays embedded
   - For each founder, generate: "This founder's background most closely resembles the pattern described in 'Do Things That Don't Scale'"

### Layer 3 — Intelligence Agents

Three specialized agents run in parallel per deal (Claude Code's coordinator + sub-agent pattern):

1. **Market Research Agent**
   - TAM estimate with sources
   - Top 5 competitors with funding history
   - Trend velocity (Google Trends API + news volume)
   - Regulatory risk flags

2. **Founder Analysis Agent**
   - Queries founder archetype vector store
   - Skill gap analysis
   - Domain expertise score (0–10)
   - Execution velocity signals
   - "PG pattern match" — which Paul Graham essay archetypes fit this founder

3. **Startup Rating Engine**
   - Weighted composite score:
     ```
     Score = 0.35 × team + 0.30 × market + 0.20 × traction + 0.15 × deck_quality
     ```
   - Each sub-score is 0–10 with explicit reasoning
   - Generates one-paragraph bull case and bear case

### Layer 4 — Outreach & Workflow

1. **Email Outreach Agent**
   - For startups above score threshold, drafts personalized cold email
   - References: specific founder talks/essays, adjacent portfolio companies, concrete value-add
   - Sends via Gmail API, tracks open/reply rates
   - Auto-follow-up at day 3 and day 7

2. **Deal Memo Generator**
   - Pulls all research into a structured IC memo
   - Sections: executive summary, market thesis, team analysis, competitive landscape, risks, comparable exits, recommendation
   - Outputs to Notion or PDF

### Layer 5 — Orchestrator (The Claude Code Pattern)

The coordinator is modeled directly after Claude Code's `coordinatorMode.ts`:

- Maintains a persistent task queue (JSON files on disk, survives restarts)
- Spawns sub-agents per deal with fresh context (same as `forkSubagent.ts`)
- Compresses context when it gets long (same as `services/compact/`)
- Sends task notifications from workers back to coordinator (XML task-notification pattern)
- Alerts via Slack when a deal crosses score threshold
- Auto-ingests new YC batches, scores, and queues outreach or logs pass reason

---

## Architecture (Modeled After Claude Code)

| Concept | Claude Code Source | VC-OS Equivalent |
|---|---|---|
| Tool interface | `src/Tool.ts` | `src/types/tool.ts` |
| Tool registry | `src/tools.ts` | `src/tools/registry.ts` |
| Task lifecycle | `src/utils/task/framework.ts` | `src/tasks/framework.ts` |
| Agent definition | `src/tools/AgentTool/loadAgentsDir.ts` | `src/types/agent.ts` |
| Sub-agent fork | `src/tools/AgentTool/forkSubagent.ts` | `src/coordinator/` (planned) |
| Coordinator | `src/coordinator/coordinatorMode.ts` | `src/coordinator/` (planned) |
| Context compaction | `src/services/compact/` | `src/services/compact/` (planned) |
| Vector store | N/A | `src/services/vector/` (planned) |

---

## Tech Stack

| Layer | Tool |
|---|---|
| Agent framework | Claude API + custom TypeScript loop |
| Scraping | Cheerio + Playwright + yt-dlp + Proxycurl |
| Vector DB | pgvector (PostgreSQL) |
| Relational DB | PostgreSQL (deal state, task queue) |
| Email | Gmail API + SendGrid fallback |
| Dashboard | Next.js + shadcn/ui (future) |
| Scheduler | Cron (future) |
| Language | TypeScript (ES2022, ESM) |

---

## Key Differentiators

1. **PG Semantic Similarity Score** — Embed all 200+ Paul Graham essays, then for each founder generate which essay patterns they most resemble. No other VC tool does this.

2. **Temporal Pattern Matching** — Compare startups not to current unicorns, but to what those companies looked like at seed stage. "At the time a16z invested in Airbnb, the company had $200/week in revenue."

3. **Coordinator Mode with Auto-Claim** — Runs continuously. When a new YC batch drops, it auto-ingests, scores, and either queues outreach or drops below threshold with a logged reason.

---

## Current Build Status

- [x] Core type system (Tool, Task, Agent, Message types)
- [x] Tool registry (flat map, allowlist resolution)
- [x] Task framework (create, update, persist, evict)
- [x] Web scraper tool (Cheerio + Playwright)
- [x] API client tool (Crunchbase, Proxycurl, GitHub, YouTube)
- [x] YC scraper agent (directory + detail + PG essays + YouTube transcripts)
- [x] VC portfolio agent (a16z, Sequoia, Founders Fund, Benchmark, Accel)
- [x] Founder profile agent (LinkedIn, GitHub, Twitter, scoring)
- [ ] Deck scraper agent
- [ ] Vector knowledge base (pgvector setup, embedding pipeline)
- [ ] Success pattern index
- [ ] Founder archetype store
- [ ] Market research agent
- [ ] Founder analysis agent
- [ ] Startup rating engine
- [ ] Email outreach agent
- [ ] Deal memo generator
- [ ] Orchestrator / coordinator loop
- [ ] Slack alerting
- [ ] Dashboard (Next.js)
