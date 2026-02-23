import { query } from '../db/index.js';
import { CHALLENGE_DURATION_DAYS, GRACE_PERIOD_HOURS } from '../utils/constants.js';

/**
 * Get the current active challenge.
 */
export async function getActiveChallenge() {
  const res = await query(
    `SELECT * FROM challenges WHERE is_active = TRUE ORDER BY opened_at DESC LIMIT 1`
  );
  return res.rows[0] ?? null;
}

/**
 * Create and activate a new challenge.
 */
export async function createChallenge({ prompt, constraints, scoringWeights, openedAt }) {
  const opened  = openedAt ? new Date(openedAt) : new Date();
  const closed  = new Date(opened);
  closed.setDate(closed.getDate() + CHALLENGE_DURATION_DAYS);

  // Deactivate previous challenge
  await query('UPDATE challenges SET is_active = FALSE WHERE is_active = TRUE');

  const res = await query(
    `INSERT INTO challenges (prompt, constraints, scoring_weights, opened_at, closed_at, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *`,
    [prompt, constraints ?? null, JSON.stringify(scoringWeights ?? {}), opened, closed]
  );
  return res.rows[0];
}

/**
 * Update a challenge's Discord message/thread IDs after posting.
 */
export async function setChallengeDiscordIds(challengeId, messageId, threadId) {
  await query(
    'UPDATE challenges SET discord_message_id = $1, discord_thread_id = $2 WHERE id = $3',
    [messageId, threadId, challengeId]
  );
}

/**
 * Check whether a submission timestamp qualifies for the speed bonus.
 * Returns 0–10 points.
 */
export function calcSpeedBonus(openedAt, submittedAt, maxPts = 10) {
  const openMs    = new Date(openedAt).getTime();
  const submitMs  = new Date(submittedAt).getTime();
  const elapsedH  = (submitMs - openMs) / (1000 * 60 * 60);
  if (elapsedH <= 0)  return maxPts;  // edge case
  if (elapsedH > 48)  return 0;
  // Linear scale: full points at 0h, 0 points at 48h
  return Math.round(maxPts * (1 - elapsedH / 48));
}

/**
 * Check whether a submission is within the grace period (late but allowed).
 */
export function isLateSubmission(challenge, submittedAt) {
  const closedMs  = new Date(challenge.closed_at).getTime();
  const submitMs  = new Date(submittedAt).getTime();
  return submitMs > closedMs;
}

/**
 * Check whether the submission is past the grace period (rejected).
 */
export function isPastGracePeriod(challenge, submittedAt) {
  const graceEnd = new Date(challenge.closed_at);
  graceEnd.setHours(graceEnd.getHours() + GRACE_PERIOD_HOURS);
  return new Date(submittedAt) > graceEnd;
}

/**
 * Get all challenges (for admin/listing).
 */
export async function listChallenges(limit = 10) {
  const res = await query(
    'SELECT * FROM challenges ORDER BY opened_at DESC LIMIT $1',
    [limit]
  );
  return res.rows;
}
