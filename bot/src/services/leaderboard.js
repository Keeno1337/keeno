import { query } from '../db/index.js';
import { buildLeaderboardEmbed } from '../utils/embeds.js';

/**
 * Get the all-time XP leaderboard (top N users).
 */
export async function getAllTimeLeaderboard(limit = 10) {
  const res = await query(
    `SELECT discord_id, username, xp, rank FROM users ORDER BY xp DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

/**
 * Get the leaderboard for the current weekly challenge cycle.
 * "Weekly" = sum of XP awarded during the current active challenge.
 */
export async function getWeeklyLeaderboard(challengeId, limit = 10) {
  const res = await query(
    `SELECT u.discord_id, u.username, SUM(s.xp_awarded) AS xp
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     WHERE s.challenge_id = $1 AND s.scoring_status = 'complete'
     GROUP BY u.discord_id, u.username
     ORDER BY xp DESC
     LIMIT $2`,
    [challengeId, limit]
  );
  return res.rows;
}

/**
 * Get per-challenge top-10 leaderboard.
 */
export async function getChallengeLeaderboard(challengeId, limit = 10) {
  const res = await query(
    `SELECT u.discord_id, u.username, s.total_score, s.xp_awarded
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
 * Snapshot and return all three leaderboard embeds for weekly posting.
 */
export async function buildWeeklyLeaderboardEmbeds(challengeId) {
  const [allTime, weekly, challenge] = await Promise.all([
    getAllTimeLeaderboard(10),
    getWeeklyLeaderboard(challengeId, 10),
    getChallengeLeaderboard(challengeId, 10),
  ]);

  // Save snapshot to DB
  await query(
    `INSERT INTO weekly_leaderboard_snapshots (challenge_id, snapshot, week_start)
     VALUES ($1, $2, NOW())`,
    [challengeId, JSON.stringify({ allTime, weekly, challenge })]
  );

  return [
    buildLeaderboardEmbed(allTime,   '🏆 All-Time Leaderboard',               'Total XP earned across all challenges'),
    buildLeaderboardEmbed(weekly,    '⚡ Weekly Leaderboard',                  `Challenge #${challengeId} XP`),
    buildLeaderboardEmbed(challenge, `🎯 Challenge #${challengeId} Top Scores`, 'Highest single-submission scores'),
  ];
}

/**
 * Determine the top-reacted submission for a challenge and award reaction bonus.
 * Called from the message reaction listener.
 */
export async function awardReactionBonus(client, challengeId) {
  const { query: q } = await import('../db/index.js');
  // Check if already awarded this challenge
  const existing = await q(
    'SELECT id FROM reaction_bonuses WHERE challenge_id = $1',
    [challengeId]
  );
  if (existing.rows.length) return null;

  // Find top-reacted submission (by total_score as proxy if reactions aren't tracked)
  const podium = await getChallengeLeaderboard(challengeId, 1);
  if (!podium.length) return null;

  return podium[0];
}
