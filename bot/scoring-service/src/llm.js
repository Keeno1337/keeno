import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Score submission creativity and theme fit using Claude.
 *
 * Returns { creativity: 0-25, reasoning: string }
 * (creativity score folds in theme fit per the PRD — single 25pt dimension)
 */
export async function scoreCreativity({ challengePrompt, description, screenshotBase64, maxPts = 25 }) {
  const imageContent = screenshotBase64
    ? [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 },
        },
      ]
    : [];

  const systemPrompt = `You are a fair, encouraging judge for a gamified coding competition called Vibe Code Arena.
Your task: evaluate a submission's creativity and how well it fits the challenge theme.

Scoring rubric (total ${maxPts} points):
- Theme Fit (0-${Math.round(maxPts * 0.5)}): Does the project clearly address the challenge prompt? Is it thematically relevant?
- Creativity (0-${Math.round(maxPts * 0.5)}): Is the idea original, playful, or surprising? Does it stand out?

Be strict but fair. A direct, well-executed idea scores better than a vague ambitious one.
Return ONLY valid JSON: { "score": <integer 0-${maxPts}>, "reasoning": "<2-3 sentences max>" }`;

  const userContent = [
    {
      type: 'text',
      text: `Challenge prompt: "${challengePrompt}"\n\nSubmission description: "${description}"`,
    },
    ...imageContent,
  ];

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const text = response.content[0].text.trim();
  try {
    const parsed = JSON.parse(text);
    const score  = Math.max(0, Math.min(maxPts, parseInt(parsed.score, 10)));
    return { creativity: score, reasoning: parsed.reasoning ?? '' };
  } catch {
    // Fallback: try to extract a number
    const match = text.match(/"score"\s*:\s*(\d+)/);
    const score = match ? Math.min(maxPts, parseInt(match[1], 10)) : Math.floor(maxPts * 0.5);
    return { creativity: score, reasoning: 'Score estimated from partial response.' };
  }
}
