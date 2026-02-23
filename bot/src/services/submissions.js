import { query } from '../db/index.js';
import { MAX_SUBMISSIONS_PER_CHALLENGE } from '../utils/constants.js';

/**
 * Count submissions by a user for a given challenge.
 */
export async function countUserSubmissions(userId, challengeId) {
  const res = await query(
    'SELECT COUNT(*) FROM submissions WHERE user_id = $1 AND challenge_id = $2',
    [userId, challengeId]
  );
  return parseInt(res.rows[0].count, 10);
}

/**
 * Check if a URL has been submitted before in this challenge (duplicate detection).
 */
export async function isDuplicateUrl(url, challengeId, currentUserId) {
  const res = await query(
    'SELECT user_id FROM submissions WHERE url = $1 AND challenge_id = $2 AND user_id != $3',
    [url, challengeId, currentUserId]
  );
  return res.rows.length > 0;
}

/**
 * Create a new submission record.
 */
export async function createSubmission({ userId, challengeId, url, githubUrl, description, isLate }) {
  const res = await query(
    `INSERT INTO submissions
       (user_id, challenge_id, url, github_url, description, is_late, scoring_status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [userId, challengeId, url, githubUrl ?? null, description, isLate ?? false]
  );
  return res.rows[0];
}

/**
 * Set the Discord message ID for a submission.
 */
export async function setSubmissionMessageId(submissionId, messageId) {
  await query(
    'UPDATE submissions SET discord_message_id = $1 WHERE id = $2',
    [messageId, submissionId]
  );
}

/**
 * Mark a submission as scoring in progress.
 */
export async function markScoringInProgress(submissionId) {
  await query(
    `UPDATE submissions SET scoring_status = 'scoring' WHERE id = $1`,
    [submissionId]
  );
}

/**
 * Write the final score to a submission.
 */
export async function finalizeScore(submissionId, { scoreBreakdown, totalScore, xpAwarded }) {
  const res = await query(
    `UPDATE submissions
     SET score_breakdown = $1,
         total_score     = $2,
         xp_awarded      = $3,
         scoring_status  = 'complete',
         scored_at       = NOW()
     WHERE id = $4
     RETURNING *`,
    [JSON.stringify(scoreBreakdown), totalScore, xpAwarded, submissionId]
  );
  return res.rows[0];
}

/**
 * Mark a submission scoring as failed.
 */
export async function markScoringFailed(submissionId) {
  await query(
    `UPDATE submissions SET scoring_status = 'failed' WHERE id = $1`,
    [submissionId]
  );
}

/**
 * Get all scored submissions for a challenge, ordered by total score.
 */
export async function getChallengePodium(challengeId, limit = 10) {
  const res = await query(
    `SELECT s.*, u.discord_id, u.username
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     WHERE s.challenge_id = $1 AND s.scoring_status = 'complete'
     ORDER BY s.total_score DESC
     LIMIT $2`,
    [challengeId, limit]
  );
  return res.rows;
}

/**
 * Retrieve a single submission by ID.
 */
export async function getSubmission(submissionId) {
  const res = await query('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  return res.rows[0] ?? null;
}

/**
 * Flag a submission for moderator review (short description).
 */
export async function flagForReview(submissionId, reason) {
  // In production this might set a flag column or create a moderator alert.
  // For now, log to bot-logs channel via a separate mechanism.
  console.warn(`[FLAG] Submission ${submissionId} flagged: ${reason}`);
}
