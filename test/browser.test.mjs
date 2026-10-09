// Runs the real check in WebKit against the pages in fixtures/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkUrl } from '../src/run.mjs';

const fixtures = new URL('./fixtures/', import.meta.url);
let server, base;

test.before(async () => {
  server = createServer(async (req, res) => {
    try {
      const body = await readFile(new URL('.' + req.url, fixtures));
      res.writeHead(200, { 'content-type': 'text/html' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const ids = (report) => report.findings.map((f) => f.id).sort();

test('a responsive page passes', async () => {
  const report = await checkUrl(`${base}/good.html`, { settle: 200 });
  assert.deepEqual(ids(report), []);
});

test('the bad page shows every problem, with a report on disk', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'iphone-duo-check-'));
  const report = await checkUrl(`${base}/bad.html`, { settle: 200, outDir });
  assert.deepEqual(ids(report), ['on-fold', 'orientation-query', 'side-scroll', 'stale-resize', 'tap-size']);

  const scroll = report.findings.find((f) => f.id === 'side-scroll');
  assert.equal(scroll.state, 'folded');
  assert.match(scroll.items[0].label, /banner/);
  assert.match(report.findings.find((f) => f.id === 'stale-resize').items[0].label, /#stale/);
  assert.match(report.findings.find((f) => f.id === 'on-fold').items[0].label, /#fold-btn/);

  for (const f of ['report.html', 'report.json', 'folded.jpg', 'unfolded.jpg', 'open.jpg']) {
    await access(join(outDir, f));
  }
});

test('a page without a viewport meta tag is an error', async () => {
  const report = await checkUrl(`${base}/nometa.html`, { settle: 200 });
  assert.ok(ids(report).includes('viewport-meta'));
});
