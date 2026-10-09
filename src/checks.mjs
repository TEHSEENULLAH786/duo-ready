import { DUO, MIN_TAP, MIN_TAP_EDGE } from './devices.mjs';

// Each check takes probe results (see probe.mjs) and returns findings:
//   { id, severity: 'error' | 'warn' | 'info', state, title, detail, fix, items: [{ label, x, y, w, h }] }
// `state` is the screenshot the items are drawn on: folded, unfolded or open.

const MAX_ITEMS = 10;

export function checkViewportMeta(folded) {
  const content = folded.viewportMeta;
  if (content != null && /width\s*=\s*device-width/i.test(content)) return [];
  return [
    {
      id: 'viewport-meta',
      severity: 'error',
      state: 'folded',
      title: content == null ? 'No viewport meta tag' : 'Viewport meta tag lacks width=device-width',
      detail:
        'Without it Safari lays the page out at 980px and shrinks it to fit, so text is tiny on ' +
        'both Duo screens.',
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>.',
      items: [],
    },
  ];
}

export function checkSideScroll(probe, state) {
  if (probe.sideScroll <= 0) return [];
  const width = probe.viewport.width;
  return [
    {
      id: 'side-scroll',
      severity: 'error',
      state,
      title: `Page scrolls sideways (${width}px wide screen)`,
      detail:
        `The page is ${probe.scrollWidth}px wide on a ${width}px screen. ` +
        (probe.overflowers.length
          ? `${probe.overflowers.length} element${probe.overflowers.length === 1 ? '' : 's'} stick out past the right edge.`
          : 'No single element was found sticking out; look for wide margins or transforms.'),
      fix:
        'Give the marked elements max-width: 100%, let flex rows wrap, and avoid fixed pixel ' +
        'widths. Use container queries rather than phone/tablet breakpoints.',
      items: probe.overflowers.slice(0, MAX_ITEMS),
    },
  ];
}

// The common Duo bug: the page measures the screen once, so after the phone
// opens it keeps the folded layout. Compares the page opened from folded with
// a fresh load at the open size; the same element should be the same width.
export function checkStaleResize(unfolded, open) {
  const fresh = new Map(open.blocks.map((b) => [b.key, b]));
  const stale = [];
  for (const b of unfolded.blocks) {
    const f = fresh.get(b.key);
    if (!f) continue;
    const diff = Math.abs(b.w - f.w);
    if (diff > Math.max(40, f.w * 0.15)) stale.push({ ...b, fresh: f.w, diff });
  }
  if (!stale.length) return [];

  // Keep only the outermost stale element: a stale container makes every
  // child stale too.
  const keys = new Set(stale.map((s) => s.key));
  const outer = stale.filter((s) => {
    const parts = s.key.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      if (keys.has(parts.slice(0, i).join('/'))) return false;
    }
    return true;
  });
  outer.sort((a, b) => b.diff - a.diff);

  return [
    {
      id: 'stale-resize',
      severity: 'error',
      state: 'unfolded',
      title: 'Layout does not update when the phone opens',
      detail:
        `After resizing from ${DUO.folded.width}px to ${DUO.open.width}px, ` +
        `${outer.length} element${outer.length === 1 ? '' : 's'} kept a different width than a fresh ` +
        'load at the open size. The page (or a script on it) read the screen size once.',
      fix:
        'Do not cache window.innerWidth or screen.width at start-up. Size with CSS (flex, grid, ' +
        'container queries), or re-measure in a ResizeObserver / resize listener.',
      items: outer.slice(0, MAX_ITEMS).map((s) => ({
        label: `${s.label}: ${s.w}px, should be ${s.fresh}px`,
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
      })),
    },
  ];
}

export function checkFold(open) {
  const lo = DUO.foldX - DUO.foldBand;
  const hi = DUO.foldX + DUO.foldBand;
  // Wide controls (a full-width search box) are still easy to tap either side
  // of the crease; small ones sitting on it are not.
  const onFold = open.interactive.filter((el) => el.x < hi && el.x + el.w > lo && el.w < 200);
  if (!onFold.length) return [];
  return [
    {
      id: 'on-fold',
      severity: 'warn',
      state: 'open',
      title: `${onFold.length} control${onFold.length === 1 ? ' sits' : 's sit'} on the fold`,
      detail:
        'On the open Duo the crease runs down the middle of the screen. Buttons and links on it ' +
        'are hard to tap, and Safari does not move them aside the way iOS does for native apps.',
      fix:
        'Lay the open screen out as two columns with a gap at the centre, or keep small controls ' +
        'off the middle (CSS grid with a central gutter works well).',
      items: onFold.slice(0, MAX_ITEMS),
    },
  ];
}

export function checkTapTargets(folded) {
  const small = folded.interactive.filter(
    // Under 44 both ways, or under 24 (the WCAG minimum) either way: a wide
    // but 31px-tall link or text box is still easy to hit.
    (el) => !el.inlineInText && ((el.w < MIN_TAP && el.h < MIN_TAP) || Math.min(el.w, el.h) < MIN_TAP_EDGE),
  );
  if (!small.length) return [];
  return [
    {
      id: 'tap-size',
      severity: 'warn',
      state: 'folded',
      title: `${small.length} tap target${small.length === 1 ? ' is' : 's are'} too small`,
      detail:
        `The folded screen is only ${DUO.folded.width}px wide. Apple asks for at least ` +
        `${MIN_TAP}×${MIN_TAP}pt per control; these are smaller both ways, or under ${MIN_TAP_EDGE}px one way.`,
      fix: 'Add padding (or min-width / min-height: 44px) to the marked controls.',
      items: small.slice(0, MAX_ITEMS).map((el) => ({ ...el, label: `${el.label} (${el.w}×${el.h})` })),
    },
  ];
}

export function checkOrientation(open) {
  if (!open.orientationRules.length) return [];
  return [
    {
      id: 'orientation-query',
      severity: 'info',
      state: 'open',
      title: 'Stylesheets use orientation media queries',
      detail:
        `The open Duo is ${DUO.open.width}×${DUO.open.height}: wider than tall while held upright, ` +
        'so it matches (orientation: landscape). Check these rules suit a phone in the hand.',
      fix: 'Choose layouts by available width (min-width, container queries), not orientation.',
      items: open.orientationRules.slice(0, MAX_ITEMS).map((r) => ({ label: `@media ${r.media} — ${r.source}` })),
    },
  ];
}

// The checks that need only the folded load, so its screenshot can be marked
// before the page is resized.
export function foldedChecks(folded) {
  return [...checkViewportMeta(folded), ...checkSideScroll(folded, 'folded'), ...checkTapTargets(folded)];
}

export function runChecks({ folded, unfolded, open }) {
  const order = { error: 0, warn: 1, info: 2 };
  return [
    ...foldedChecks(folded),
    ...checkSideScroll(open, 'open'),
    ...checkStaleResize(unfolded, open),
    ...checkFold(open),
    ...checkOrientation(open),
  ].sort((a, b) => order[a.severity] - order[b.severity]);
}

// The boxes to draw on one screenshot, in the order the report numbers them.
export function marksFor(findings, state) {
  return findings
    .filter((f) => f.state === state)
    .flatMap((f) => f.items.filter((i) => i.w).map((i) => ({ ...i, severity: f.severity })));
}

export function stateName(state) {
  return { folded: 'folded', unfolded: 'after opening', open: 'open' }[state] ?? state;
}
