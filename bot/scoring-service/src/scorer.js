import { fetchAndScreenshot } from './screenshot.js';
import { scoreCreativity }    from './llm.js';
import { analyzeRepo }        from './static-analysis.js';
import { SCORE_DIMENSIONS }   from '../../src/utils/constants.js';

/**
 * Run the full scoring pipeline for a submission.
 *
 * @param {object} params
 * @param {string} params.url              - Live project URL
 * @param {string} [params.githubUrl]      - Optional GitHub repo URL
 * @param {string} params.description      - Submission description
 * @param {string} params.challengePrompt  - Challenge prompt text
 * @param {object} params.scoringWeights   - Per-challenge weight overrides
 * @param {Date}   params.challengeOpenedAt - When challenge opened (for speed bonus)
 * @param {Date}   params.submittedAt       - When submission was received
 * @param {number} params.speedBonusPts    - Pre-calculated speed bonus (0-10)
 *
 * @returns {Promise<{ breakdown: object, total: number }>}
 */
export async function runScoringPipeline(params) {
  const {
    url,
    githubUrl,
    description,
    challengePrompt,
    scoringWeights = {},
    speedBonusPts = 0,
  } = params;

  const weights = {
    ...{ demo: 30, quality: 20, creativity: 25, completeness: 15, speed: 10 },
    ...scoringWeights,
  };

  const breakdown = {
    demo:         0,
    quality:      0,
    creativity:   0,
    completeness: 0,
    speed:        speedBonusPts,
    llm_reasoning: '',
    quality_details: '',
  };

  // --- 1. Working Demo (URL fetch + HTTP status) ---
  let screenshotBase64 = null;
  try {
    const { ok, statusCode, screenshotBase64: shot } = await fetchAndScreenshot(url);
    if (ok) {
      breakdown.demo    = weights.demo;   // full points for live demo
      screenshotBase64  = shot;
    } else {
      breakdown.demo = 0;
      breakdown.quality_details += `URL returned status ${statusCode}. `;
    }
  } catch {
    breakdown.demo = 0;
  }

  // --- 2. Code Quality (static analysis if GitHub URL provided) ---
  if (githubUrl && /github\.com\//i.test(githubUrl)) {
    const { quality, details } = await analyzeRepo(githubUrl, weights.quality);
    breakdown.quality = quality;
    breakdown.quality_details += details;
  } else {
    // No repo — award partial credit
    breakdown.quality = Math.floor(weights.quality * 0.5);
    breakdown.quality_details += 'No GitHub repo provided — partial credit.';
  }

  // --- 3. Creativity / Theme Fit (LLM) ---
  const { creativity, reasoning } = await scoreCreativity({
    challengePrompt,
    description,
    screenshotBase64,
    maxPts: weights.creativity,
  });
  breakdown.creativity   = creativity;
  breakdown.llm_reasoning = reasoning;

  // --- 4. Completeness (description keyword heuristic) ---
  breakdown.completeness = scoreCompleteness(description, weights.completeness);

  // --- 5. Clamp all scores to their max weights ---
  breakdown.demo         = Math.min(breakdown.demo,         weights.demo);
  breakdown.quality      = Math.min(breakdown.quality,      weights.quality);
  breakdown.creativity   = Math.min(breakdown.creativity,   weights.creativity);
  breakdown.completeness = Math.min(breakdown.completeness, weights.completeness);
  breakdown.speed        = Math.min(breakdown.speed,        weights.speed);

  const total = breakdown.demo + breakdown.quality + breakdown.creativity +
                breakdown.completeness + breakdown.speed;

  return { breakdown, total: Math.min(100, total) };
}

/**
 * Simple keyword-based heuristic for completeness.
 * Awards points for presence of feature indicators in the description.
 */
function scoreCompleteness(description, maxPts) {
  const text  = description.toLowerCase();
  const words = text.split(/\s+/).length;

  // Reward longer, more detailed descriptions
  let score = 0;
  if (words >= 20)  score += Math.floor(maxPts * 0.3);
  if (words >= 50)  score += Math.floor(maxPts * 0.2);
  if (words >= 100) score += Math.floor(maxPts * 0.1);

  // Keyword indicators of a complete project
  const indicators = [
    /feature/,   /built/,    /includes?/, /implement/,
    /works?/,    /deploy/,   /live/,      /demo/,
    /user/,      /button/,   /api/,       /database/,
    /login/,     /auth/,     /ui/,        /style/,
  ];
  const hits = indicators.filter((rx) => rx.test(text)).length;
  score += Math.floor((hits / indicators.length) * maxPts * 0.4);

  return Math.min(maxPts, score);
}
