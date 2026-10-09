import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DUO, SAFARI_UA } from './devices.mjs';
import { probeLayout, drawMarks, clearMarks } from './probe.mjs';
import { foldedChecks, marksFor, runChecks } from './checks.mjs';
import { renderHtml } from './report-html.mjs';

const MAX_ELEMENTS = 8000;
// Long pages are cut here in screenshots, in CSS pixels.
const MAX_SHOT_HEIGHT = 4000;

/**
 * Checks one URL for iPhone Duo problems.
 * @param {string} url
 * @param {{ outDir?: string|null, engine?: 'webkit'|'chromium', timeout?: number, settle?: number }} [opts]
 *   outDir: where report.html, report.json and screenshots go (null: none).
 *   settle: ms to wait after the page loads and after the phone opens.
 */
export async function checkUrl(url, opts = {}) {
  const { outDir = null, engine = 'webkit', timeout = 30000, settle = 800 } = opts;
  const pw = await import('playwright').catch(() => {
    throw new Error('iphone-duo-check needs Playwright: npm install playwright');
  });
  const browserType = pw[engine];
  if (!browserType || !['webkit', 'chromium'].includes(engine)) {
    throw new Error(`Unknown engine "${engine}" (use webkit or chromium)`);
  }

  let browser;
  try {
    browser = await browserType.launch();
  } catch (err) {
    if (/Executable doesn't exist|playwright install/i.test(String(err.message))) {
      throw new Error(`The ${engine} browser isn't installed. Run: npx playwright install ${engine}`);
    }
    throw err;
  }

  try {
    const newPage = async (size) => {
      const context = await browser.newContext({
        viewport: size,
        deviceScaleFactor: DUO.deviceScaleFactor,
        // isMobile makes the viewport meta tag count, as on a phone.
        isMobile: true,
        hasTouch: true,
        userAgent: SAFARI_UA,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(timeout);
      return page;
    };

    const load = async (page) => {
      await page.goto(url, { waitUntil: 'load', timeout });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(settle);
    };

    const probe = (page) => page.evaluate(probeLayout, { maxElements: MAX_ELEMENTS });

    const shot = async (page, name, marks, foldX, layout) => {
      if (!outDir) return null;
      const file = `${name}.jpg`;
      await page.evaluate(drawMarks, { marks, foldX });
      await page.screenshot({
        path: join(outDir, file),
        type: 'jpeg',
        quality: 80,
        fullPage: true,
        clip: { x: 0, y: 0, width: layout.viewport.width, height: Math.min(layout.docHeight, MAX_SHOT_HEIGHT) },
      });
      await page.evaluate(clearMarks);
      return file;
    };

    if (outDir) await mkdir(outDir, { recursive: true });
    const screenshots = {};

    // 1. Folded.
    const foldedPage = await newPage(DUO.folded);
    await load(foldedPage);
    const folded = await probe(foldedPage);
    screenshots.folded = await shot(foldedPage, 'folded', marksFor(foldedChecks(folded), 'folded'), null, folded);

    // 2. The same page after the phone opens. Two frames for resize handlers
    // to run, then time for debounced ones.
    await foldedPage.setViewportSize(DUO.open);
    await foldedPage.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await foldedPage.waitForTimeout(settle);
    const unfolded = await probe(foldedPage);

    // 3. A fresh load at the open size.
    const openPage = await newPage(DUO.open);
    await load(openPage);
    const open = await probe(openPage);

    const findings = runChecks({ folded, unfolded, open });
    screenshots.unfolded = await shot(foldedPage, 'unfolded', marksFor(findings, 'unfolded'), DUO.foldX, unfolded);
    screenshots.open = await shot(openPage, 'open', marksFor(findings, 'open'), DUO.foldX, open);

    const report = {
      url,
      engine,
      checkedAt: new Date().toISOString(),
      sizes: { folded: DUO.folded, open: DUO.open, foldX: DUO.foldX },
      summary: {
        errors: findings.filter((f) => f.severity === 'error').length,
        warnings: findings.filter((f) => f.severity === 'warn').length,
        notes: findings.filter((f) => f.severity === 'info').length,
      },
      findings,
      screenshots: outDir ? screenshots : {},
    };

    if (outDir) {
      await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
      await writeFile(join(outDir, 'report.html'), renderHtml(report));
    }
    return report;
  } finally {
    await browser.close();
  }
}
