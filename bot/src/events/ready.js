import cron from 'node-cron';
import { buildWeeklyLeaderboardEmbeds } from '../services/leaderboard.js';
import { getActiveChallenge } from '../services/challenges.js';
import { resetWeeklyHelpXP } from '../services/xp.js';

export const name = 'ready';
export const once = true;

export async function execute(client) {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  client.user.setActivity('Scoring submissions...', { type: 3 }); // WATCHING

  // Weekly leaderboard post — every Monday at 09:00 UTC
  cron.schedule('0 9 * * 1', async () => {
    console.log('[Cron] Posting weekly leaderboards...');
    await postWeeklyLeaderboards(client);
  }, { timezone: 'UTC' });

  // Reset weekly help XP — every Monday at 00:00 UTC
  cron.schedule('0 0 * * 1', async () => {
    console.log('[Cron] Resetting weekly help XP...');
    await resetWeeklyHelpXP();
  }, { timezone: 'UTC' });

  console.log('[Bot] Cron jobs scheduled');
}

async function postWeeklyLeaderboards(client) {
  const challenge = await getActiveChallenge();
  if (!challenge) {
    console.log('[Cron] No active challenge — skipping leaderboard post');
    return;
  }

  try {
    const embeds = await buildWeeklyLeaderboardEmbeds(challenge.id);

    for (const [, guild] of client.guilds.cache) {
      const channels = await guild.channels.fetch();
      const lbCh     = channels.find((c) => c.name === 'leaderboard');
      if (!lbCh) continue;

      for (const embed of embeds) {
        await lbCh.send({ embeds: [embed] });
      }

      // Award top-3 temporary badges via roles (best-effort)
      await awardWeeklyBadges(guild, challenge.id).catch(console.error);
    }
  } catch (err) {
    console.error('[Cron] Failed to post leaderboards:', err.message);
  }
}

async function awardWeeklyBadges(guild, challengeId) {
  const { getWeeklyLeaderboard } = await import('../services/leaderboard.js');
  const top3 = await getWeeklyLeaderboard(challengeId, 3);
  if (!top3.length) return;

  // Find or create the weekly winner role
  let winnerRole = guild.roles.cache.find((r) => r.name === 'Weekly Top 3');
  if (!winnerRole) {
    winnerRole = await guild.roles.create({
      name:   'Weekly Top 3',
      color:  0xf1c40f,
      reason: 'Auto-created by Vibe Code Arena bot',
    });
  }

  // Remove the role from previous holders
  const membersWithRole = winnerRole.members;
  for (const [, member] of membersWithRole) {
    await member.roles.remove(winnerRole).catch(() => {});
  }

  // Award to new top 3
  for (const row of top3) {
    const member = await guild.members.fetch(row.discord_id).catch(() => null);
    if (member) await member.roles.add(winnerRole).catch(() => {});
  }
}
