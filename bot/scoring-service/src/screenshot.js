import puppeteer from 'puppeteer';

let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,800',
      ],
    });
  }
  return browser;
}

/**
 * Attempt to fetch a URL and take a screenshot.
 *
 * Returns:
 *   { ok: boolean, statusCode: number|null, screenshotBase64: string|null, error: string|null }
 */
export async function fetchAndScreenshot(url, timeoutMs = 15_000) {
  const b    = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (compatible; VibeCodeArenaBot/1.0; +https://github.com/Keeno1337/keeno)'
    );

    let statusCode = null;
    page.on('response', (res) => {
      if (res.url() === url || res.url().startsWith(url)) {
        statusCode = res.status();
      }
    });

    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: timeoutMs,
    });

    if (!statusCode) statusCode = response?.status() ?? null;

    const ok = statusCode >= 200 && statusCode < 400;

    let screenshotBase64 = null;
    if (ok) {
      const buf = await page.screenshot({ type: 'png', fullPage: false });
      screenshotBase64 = buf.toString('base64');
    }

    return { ok, statusCode, screenshotBase64, error: null };
  } catch (err) {
    return { ok: false, statusCode: null, screenshotBase64: null, error: err.message };
  } finally {
    await page.close();
  }
}

/**
 * Close the shared browser instance (call on process exit).
 */
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
