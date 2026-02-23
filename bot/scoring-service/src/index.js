import 'dotenv/config';
import express from 'express';
import { runScoringPipeline } from './scorer.js';
import { closeBrowser }       from './screenshot.js';

const app  = express();
const PORT = process.env.SCORING_SERVICE_PORT ?? 3001;

app.use(express.json({ limit: '2mb' }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * POST /score
 * Body: {
 *   url, githubUrl?, description, challengePrompt,
 *   scoringWeights?, speedBonusPts, submissionId
 * }
 */
app.post('/score', async (req, res) => {
  const {
    url,
    githubUrl,
    description,
    challengePrompt,
    scoringWeights,
    speedBonusPts = 0,
    submissionId,
  } = req.body;

  if (!url || !description || !challengePrompt) {
    return res.status(400).json({ error: 'url, description, and challengePrompt are required' });
  }

  console.log(`[Scorer] Scoring submission ${submissionId}: ${url}`);

  try {
    const result = await runScoringPipeline({
      url,
      githubUrl,
      description,
      challengePrompt,
      scoringWeights,
      speedBonusPts,
    });

    console.log(`[Scorer] Done: submission=${submissionId} total=${result.total}`);
    res.json({ breakdown: result.breakdown, total: result.total });
  } catch (err) {
    console.error(`[Scorer] Failed for submission ${submissionId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[Scorer] Scoring service listening on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('[Scorer] Shutting down...');
  await closeBrowser();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});
