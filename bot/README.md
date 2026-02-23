# Vibe Code Arena Bot

Gamified Discord bot for Vibe Code Arena — automated project scoring, XP progression, and community leaderboards.

## Architecture

```
bot/
├── src/
│   ├── index.js              Main bot entry point
│   ├── deploy-commands.js    Register slash commands with Discord
│   ├── commands/
│   │   ├── submit.js         /submit — submit a project
│   │   ├── profile.js        /profile — view XP and rank
│   │   ├── leaderboard.js    /leaderboard — all-time, weekly, challenge boards
│   │   ├── appeal.js         /appeal — appeal a score
│   │   ├── help.js           /help — info and help XP logging
│   │   └── admin.js          /admin — challenge management and score adjustments
│   ├── events/
│   │   ├── ready.js          On-connect setup + cron jobs
│   │   └── interactionCreate.js  Route slash commands
│   ├── db/
│   │   ├── schema.sql        PostgreSQL schema
│   │   ├── index.js          Connection pool + migrate()
│   │   └── migrate.js        Run migrations standalone
│   ├── services/
│   │   ├── xp.js             XP award, rank calc, streak tracking
│   │   ├── challenges.js     Challenge CRUD and timing helpers
│   │   ├── submissions.js    Submission CRUD and status
│   │   └── leaderboard.js    Leaderboard queries and weekly snapshots
│   └── utils/
│       ├── constants.js      Ranks, scoring weights, thresholds
│       └── embeds.js         Discord embed builders
└── scoring-service/
    └── src/
        ├── index.js          Express HTTP server (POST /score)
        ├── scorer.js         Main scoring pipeline orchestrator
        ├── screenshot.js     Puppeteer URL fetch + screenshot
        ├── llm.js            Claude API creativity scoring
        └── static-analysis.js  ESLint static analysis on GitHub repos
```

## Scoring Pipeline

When a user runs `/submit`, the bot:

1. Validates the URL, description length, and challenge status
2. Checks per-challenge submission limits (max 3) and duplicate URLs
3. Calls the scoring microservice (`POST /score`) with a 60s timeout
4. The scoring service:
   - Fetches the URL with Puppeteer, checks HTTP 200 → **Working Demo (30 pts)**
   - If a GitHub URL is provided, runs ESLint static analysis → **Code Quality (20 pts)**
   - Calls Claude (`claude-haiku-4-5`) with the description + screenshot → **Creativity/Theme Fit (25 pts)**
   - Scores description length and keyword density → **Completeness (15 pts)**
   - Compares submission time to challenge open time → **Speed Bonus (10 pts)**
5. XP = score × rank multiplier (0.75–1.0, higher ranks earn slightly less to prevent runaway leaders)
6. Awards XP, checks for rank-up, updates streak
7. Auto-posts to `#showcase` if score ≥ 60

## Discord Server Channels

| Channel | Purpose |
|---------|---------|
| `#welcome` | Onboarding, rules, scoring explainer |
| `#challenges` | Bot posts weekly challenge here |
| `#submissions` | Thread auto-created per challenge |
| `#showcase` | Auto-posted high-score (≥60) submissions |
| `#leaderboard` | Weekly leaderboard posts |
| `#general` | Community chat |
| `#help` | Help others for XP (capped 50/week) |
| `#bot-logs` | Admin-only bot action log |
| `#appeals` | Private thread per appeal |

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Discord bot token and application
- Anthropic API key

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DATABASE_URL=postgresql://user:pass@localhost:5432/vibe_code_arena
ANTHROPIC_API_KEY=...
SCORING_SERVICE_URL=http://localhost:3001
```

### Installation

```bash
npm install
```

### Database

```bash
npm run db:migrate
```

### Register Slash Commands

```bash
# Guild-scoped (instant, for dev/testing):
GUILD_ID=your_server_id npm run deploy-commands

# Global (takes up to 1 hour to propagate):
npm run deploy-commands
```

### Run

Start both processes (two terminals or use Docker):

```bash
# Bot
npm start

# Scoring microservice
npm run scoring-service
```

### Docker

```bash
cp .env.example .env
# Edit .env with real values
docker compose up -d
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/submit <url> <description> [github_url]` | Submit a project for the active challenge |
| `/profile [user]` | View XP, rank, streak, and progress |
| `/leaderboard [type]` | All-time, weekly, or challenge leaderboard |
| `/appeal <submission_id> <reason>` | Appeal a score (1 per challenge) |
| `/help info` | Show commands and scoring info |
| `/help log <user> <summary>` | Log helping someone (+XP) |
| `/admin post-challenge <prompt>` | Post a new weekly challenge |
| `/admin adjust-score <id> <score> <reason>` | Manually adjust a submission score |
| `/admin resolve-appeal <id> <approve\|reject>` | Resolve an appeal |
| `/admin post-leaderboard` | Manually post leaderboards |
| `/admin award-xp <user> <amount>` | Manually award XP |

## Ranks

| Rank | XP | Title | Perk |
|------|----|-------|------|
| 0 | 0 | Script Kiddie | Basic access |
| 1 | 500 | Builder | Custom role color |
| 2 | 1,500 | Hacker | Private WIP channel |
| 3 | 3,500 | Architect | Vote on challenges |
| 4 | 7,500 | Wizard | Early challenge access |
| 5 | 15,000 | Vibe Lord | Co-host monthly jam |
