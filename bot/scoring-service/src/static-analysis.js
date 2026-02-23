import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

/**
 * Run a basic static analysis against a GitHub repository URL.
 *
 * Strategy:
 *   1. git clone --depth 1 into a temp dir
 *   2. Run eslint (if .js/.ts files found)
 *   3. Convert error count → score (0-20)
 *
 * Returns { quality: 0-20, details: string }
 */
export async function analyzeRepo(githubUrl, maxPts = 20) {
  let tmpDir = null;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'vca-'));

    // Clone with a 30s timeout
    await execFileAsync('git', ['clone', '--depth', '1', '--quiet', githubUrl, tmpDir], {
      timeout: 30_000,
    });

    // Count JS/TS files
    const { stdout: fileList } = await execFileAsync(
      'find',
      [tmpDir, '-name', '*.js', '-o', '-name', '*.ts', '-o', '-name', '*.jsx', '-o', '-name', '*.tsx'],
      { timeout: 5_000 }
    );
    const files = fileList.trim().split('\n').filter(Boolean);

    if (!files.length) {
      return { quality: Math.floor(maxPts * 0.5), details: 'No JS/TS files found — partial credit awarded.' };
    }

    // Try eslint (best-effort; may not be installed)
    let errorCount = 0;
    let warningCount = 0;
    try {
      const { stdout: eslintOut } = await execFileAsync(
        'npx',
        ['--yes', 'eslint', '--no-eslintrc', '-c', '{}', '--format', 'json', ...files.slice(0, 20)],
        { timeout: 20_000, cwd: tmpDir }
      );
      const results = JSON.parse(eslintOut);
      for (const r of results) {
        errorCount   += r.errorCount;
        warningCount += r.warningCount;
      }
    } catch {
      // ESLint returned non-zero exit (errors found) or not available
    }

    // Score: start at max, subtract 1pt per 2 errors, 0.5pt per 5 warnings
    const deduction = Math.floor(errorCount / 2) + Math.floor(warningCount / 5);
    const score     = Math.max(0, Math.min(maxPts, maxPts - deduction));
    const details   = `${files.length} files analysed · ${errorCount} errors · ${warningCount} warnings`;

    return { quality: score, details };
  } catch (err) {
    // Clone failed or other error — award partial credit
    return { quality: Math.floor(maxPts * 0.4), details: `Analysis unavailable: ${err.message.slice(0, 100)}` };
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
