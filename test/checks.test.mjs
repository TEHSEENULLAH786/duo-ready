import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFold, checkStaleResize, checkTapTargets, checkViewportMeta, runChecks, marksFor } from '../src/checks.mjs';

const probe = (over = {}) => ({
  viewport: { width: 466, height: 678 },
  viewportMeta: 'width=device-width, initial-scale=1',
  sideScroll: 0,
  scrollWidth: 466,
  docHeight: 678,
  overflowers: [],
  interactive: [],
  blocks: [],
  orientationRules: [],
  ...over,
});

test('viewport meta: missing or without device-width is an error', () => {
  assert.equal(checkViewportMeta(probe()).length, 0);
  assert.equal(checkViewportMeta(probe({ viewportMeta: null }))[0].id, 'viewport-meta');
  assert.equal(checkViewportMeta(probe({ viewportMeta: 'width=1024' })).length, 1);
});

test('stale resize: reports the outermost element whose width did not follow', () => {
  const unfolded = probe({
    blocks: [
      { key: 'div:0', label: 'div.app', x: 0, y: 0, w: 466, h: 400 },
      { key: 'div:0/p:0', label: 'p', x: 0, y: 0, w: 466, h: 40 },
      { key: 'div:1', label: 'footer', x: 0, y: 400, w: 890, h: 60 },
    ],
  });
  const open = probe({
    blocks: [
      { key: 'div:0', label: 'div.app', x: 0, y: 0, w: 890, h: 300 },
      { key: 'div:0/p:0', label: 'p', x: 0, y: 0, w: 890, h: 20 },
      { key: 'div:1', label: 'footer', x: 0, y: 300, w: 890, h: 60 },
    ],
  });
  const [f] = checkStaleResize(unfolded, open);
  assert.equal(f.items.length, 1);
  assert.match(f.items[0].label, /div\.app: 466px, should be 890px/);
});

test('stale resize: small differences are ignored', () => {
  const unfolded = probe({ blocks: [{ key: 'a', label: 'a', x: 0, y: 0, w: 860, h: 40 }] });
  const open = probe({ blocks: [{ key: 'a', label: 'a', x: 0, y: 0, w: 890, h: 40 }] });
  assert.equal(checkStaleResize(unfolded, open).length, 0);
});

test('fold: small controls on the crease are flagged, wide ones and others are not', () => {
  const open = probe({
    interactive: [
      { label: 'button.buy', x: 420, y: 10, w: 60, h: 44 }, // on the crease
      { label: 'input.search', x: 16, y: 10, w: 858, h: 44 }, // wide
      { label: 'a.left', x: 16, y: 10, w: 100, h: 44 }, // off it
    ],
  });
  const [f] = checkFold(open);
  assert.deepEqual(f.items.map((i) => i.label), ['button.buy']);
});

test('tap targets: links inside sentences are exempt', () => {
  const folded = probe({
    interactive: [
      { label: 'a.inline', x: 0, y: 0, w: 30, h: 18, inlineInText: true },
      { label: 'button.x', x: 0, y: 0, w: 20, h: 20, inlineInText: false },
      { label: 'button.ok', x: 0, y: 0, w: 60, h: 44, inlineInText: false },
    ],
  });
  const [f] = checkTapTargets(folded);
  assert.equal(f.items.length, 1);
  assert.match(f.items[0].label, /button\.x/);
});

test('runChecks puts errors first and marksFor skips items without a box', () => {
  const folded = probe({ viewportMeta: null, interactive: [{ label: 'b', x: 0, y: 0, w: 10, h: 10 }] });
  const findings = runChecks({ folded, unfolded: probe(), open: probe({ orientationRules: [{ media: '(orientation: landscape)', source: 'x' }] }) });
  assert.deepEqual(findings.map((f) => f.severity), ['error', 'warn', 'info']);
  assert.equal(marksFor(findings, 'folded').length, 1);
});
