// Rank definitions — index = rank number
export const RANKS = [
  { rank: 0, title: 'Script Kiddie', xpRequired: 0,     color: 0x95a5a6, perks: 'Basic access' },
  { rank: 1, title: 'Builder',       xpRequired: 500,   color: 0x2ecc71, perks: 'Custom role color' },
  { rank: 2, title: 'Hacker',        xpRequired: 1500,  color: 0x3498db, perks: 'Private WIP channel' },
  { rank: 3, title: 'Architect',     xpRequired: 3500,  color: 0x9b59b6, perks: 'Vote on challenges' },
  { rank: 4, title: 'Wizard',        xpRequired: 7500,  color: 0xe67e22, perks: 'Early challenge access' },
  { rank: 5, title: 'Vibe Lord',     xpRequired: 15000, color: 0xe74c3c, perks: 'Co-host monthly jam' },
];

export const MAX_RANK = RANKS.length - 1;

// XP multipliers per rank (prevents runaway leaders)
export const RANK_XP_MULTIPLIERS = [1.0, 0.95, 0.90, 0.85, 0.80, 0.75];

// Scoring dimension maximums (must sum to 100)
export const SCORE_DIMENSIONS = {
  demo:         { max: 30, label: 'Working Demo' },
  quality:      { max: 20, label: 'Code Quality' },
  creativity:   { max: 25, label: 'Creativity / Theme Fit' },
  completeness: { max: 15, label: 'Completeness' },
  speed:        { max: 10, label: 'Speed Bonus' },
};

// Bonus XP
export const STREAK_BONUS_XP  = 50;   // per challenge when on a 3+ streak
export const REACTION_BONUS_XP = 25;  // top-reacted submission per challenge
export const WEEKLY_HELP_XP_CAP = 50; // max from /help per week

// Submission limits
export const MAX_SUBMISSIONS_PER_CHALLENGE = 3;
export const MIN_DESCRIPTION_WORDS        = 20;
export const SHOWCASE_SCORE_THRESHOLD     = 60;

// Timing
export const CHALLENGE_DURATION_DAYS  = 7;
export const GRACE_PERIOD_HOURS       = 24;
export const LATE_PENALTY_MULTIPLIER  = 0.85; // 15% XP penalty for late submissions
export const SPEED_BONUS_WINDOW_HOURS = 48;   // submit within 48h for full speed bonus

// Scoring service
export const SCORING_SERVICE_URL = process.env.SCORING_SERVICE_URL || 'http://localhost:3001';
export const SCORING_TIMEOUT_MS  = 60_000;

export const COLORS = {
  primary:  0x5865F2, // Discord blurple
  success:  0x57F287,
  warning:  0xFEE75C,
  error:    0xED4245,
  info:     0x5865F2,
  xp:       0xf1c40f,
  showcase: 0xe74c3c,
};
