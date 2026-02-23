import { query } from '../db/index.js';
import { RANKS, RANK_XP_MULTIPLIERS, MAX_RANK } from '../utils/constants.js';

/**
 * Get or create a user record by Discord ID.
 */
export async function getOrCreateUser(discordId, username) {
  const existing = await query(
    'SELECT * FROM users WHERE discord_id = $1',
    [discordId]
  );
  if (existing.rows.length) return existing.rows[0];

  const created = await query(
    `INSERT INTO users (discord_id, username) VALUES ($1, $2) RETURNING *`,
    [discordId, username]
  );
  return created.rows[0];
}

/**
 * Award XP to a user. Returns the updated user and whether they ranked up.
 */
export async function awardXP(discordId, xpAmount) {
  const before = await query('SELECT * FROM users WHERE discord_id = $1', [discordId]);
  if (!before.rows.length) throw new Error(`User ${discordId} not found`);
  const user = before.rows[0];

  const newXP    = user.xp + xpAmount;
  const newRank  = calcRank(newXP);
  const rankedUp = newRank > user.rank;

  await query(
    'UPDATE users SET xp = $1, rank = $2 WHERE discord_id = $3',
    [newXP, newRank, discordId]
  );

  return { user: { ...user, xp: newXP, rank: newRank }, rankedUp, oldRank: user.rank };
}

/**
 * Calculate rank from total XP.
 */
export function calcRank(xp) {
  let rank = 0;
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].xpRequired) {
      rank = i;
      break;
    }
  }
  return rank;
}

/**
 * Apply the rank-based XP multiplier to a raw score.
 * Prevents runaway leaders by softly reducing rewards at higher ranks.
 */
export function applyRankMultiplier(rawXP, rank) {
  const mult = RANK_XP_MULTIPLIERS[Math.min(rank, MAX_RANK)];
  return Math.floor(rawXP * mult);
}

/**
 * Update submission streak for a user after a valid submission.
 * Streak increments if they submitted in the previous challenge.
 */
export async function updateStreak(userId, challengeId) {
  const res = await query(
    'SELECT last_submission_challenge_id, streak FROM users WHERE id = $1',
    [userId]
  );
  if (!res.rows.length) return 0;

  const { last_submission_challenge_id, streak } = res.rows[0];
  // Consecutive means the last submitted challenge is challengeId - 1
  const isConsecutive = last_submission_challenge_id === challengeId - 1;
  const newStreak     = isConsecutive ? streak + 1 : 1;

  await query(
    'UPDATE users SET streak = $1, last_submission_challenge_id = $2 WHERE id = $3',
    [newStreak, challengeId, userId]
  );
  return newStreak;
}

/**
 * Increment submission count for a user.
 */
export async function incrementSubmissionCount(discordId) {
  await query(
    'UPDATE users SET submission_count = submission_count + 1 WHERE discord_id = $1',
    [discordId]
  );
}

/**
 * Add weekly help XP, respecting the cap.
 * Returns actual XP awarded.
 */
export async function addHelpXP(discordId, amount, cap) {
  const res = await query(
    'SELECT weekly_help_xp, xp, rank, id FROM users WHERE discord_id = $1',
    [discordId]
  );
  if (!res.rows.length) return 0;

  const { weekly_help_xp, xp, rank, id } = res.rows[0];
  const remaining = Math.max(0, cap - weekly_help_xp);
  const awarded   = Math.min(amount, remaining);
  if (awarded <= 0) return 0;

  const newXP   = xp + awarded;
  const newRank = calcRank(newXP);
  await query(
    'UPDATE users SET xp = $1, rank = $2, weekly_help_xp = weekly_help_xp + $3 WHERE id = $4',
    [newXP, newRank, awarded, id]
  );
  return awarded;
}

/**
 * Reset all users' weekly_help_xp — called on a weekly cron.
 */
export async function resetWeeklyHelpXP() {
  await query('UPDATE users SET weekly_help_xp = 0');
}
