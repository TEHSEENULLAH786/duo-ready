// Runs inside the page (page.evaluate), so it must not use anything from
// outside its own body. It measures the page as it is laid out right now and
// returns plain data; the checks in checks.mjs decide what is a problem.
export function probeLayout(opts) {
  const { maxElements } = opts;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sx = window.scrollX;
  const sy = window.scrollY;

  const INTERACTIVE =
    'a[href], button, input:not([type=hidden]), select, textarea, summary, ' +
    '[role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [onclick], [tabindex]:not([tabindex="-1"])';

  // Readable label for a report: tag#id, or tag.class.class, with up to
  // three ancestors for context.
  function label(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 3) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(part + '#' + node.id);
        break;
      }
      const classes = [...node.classList].filter((c) => /^[A-Za-z_-][\w-]*$/.test(c)).slice(0, 2);
      if (classes.length) part += '.' + classes.join('.');
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  // The element's position in the DOM, so the same element can be found in a
  // second load of the same page.
  function path(el) {
    const steps = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const parent = node.parentElement;
      if (!parent) break;
      steps.unshift(node.tagName.toLowerCase() + ':' + [...parent.children].indexOf(node));
      node = parent;
    }
    return steps.join('/');
  }

  function visible(el, rect) {
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.opacity !== '0';
  }

  // True when an ancestor below <body> clips horizontal overflow, so the
  // element sticking out doesn't widen the page.
  function clippedX(el) {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const ox = getComputedStyle(node).overflowX;
      if (ox !== 'visible') return true;
    }
    return false;
  }

  function box(rect) {
    return {
      x: Math.round(rect.left + sx),
      y: Math.round(rect.top + sy),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };
  }

  const meta = document.querySelector('meta[name="viewport"]');
  const docEl = document.documentElement;

  const all = [...document.body.querySelectorAll('*')].slice(0, maxElements);
  const overflowSet = new Set();
  const overflowers = [];
  const blocks = [];

  for (const el of all) {
    const rect = el.getBoundingClientRect();
    if (!visible(el, rect)) continue;
    if (rect.width >= 100 && rect.height >= 20) {
      blocks.push({ key: path(el), label: label(el), ...box(rect) });
    }
    const position = getComputedStyle(el).position;
    if (
      rect.right > vw + 1 &&
      rect.left < vw &&
      position !== 'fixed' &&
      !clippedX(el)
    ) {
      overflowSet.add(el);
      overflowers.push(el);
    }
  }

  // Report only the outermost element that sticks out, not each child of it.
  const outer = overflowers.filter((el) => {
    for (let p = el.parentElement; p; p = p.parentElement) if (overflowSet.has(p)) return false;
    return true;
  });

  const interactive = [];
  for (const el of document.body.querySelectorAll(INTERACTIVE)) {
    const rect = el.getBoundingClientRect();
    if (!visible(el, rect)) continue;
    const style = getComputedStyle(el);
    // A link inside a sentence is exempt from tap-size rules (as in WCAG).
    const parentText = (el.parentElement?.textContent || '').trim().length;
    const ownText = (el.textContent || '').trim().length;
    const inlineInText = style.display === 'inline' && parentText > ownText + 20;
    interactive.push({ label: label(el), ...box(rect), inlineInText });
  }

  // Orientation media queries: on the open Duo the screen is wider than
  // tall while the phone is held upright, so "landscape" rules misfire.
  const orientationRules = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    for (const rule of rules) {
      const media = rule.media?.mediaText || rule.conditionText || '';
      if (/orientation\s*:/.test(media)) {
        orientationRules.push({ media, source: sheet.href || 'inline <style>' });
      }
    }
  }

  // Whether the page really scrolls sideways (scrollWidth alone also counts
  // content the page clips with overflow-x: hidden).
  window.scrollTo(100000, sy);
  const sideScroll = Math.round(window.scrollX);
  window.scrollTo(sx, sy);

  return {
    viewport: { width: vw, height: vh },
    sideScroll,
    viewportMeta: meta ? meta.getAttribute('content') || '' : null,
    scrollWidth: Math.max(docEl.scrollWidth, document.body.scrollWidth),
    docHeight: Math.max(docEl.scrollHeight, document.body.scrollHeight),
    overflowers: outer.slice(0, 20).map((el) => ({
      label: label(el),
      ...box(el.getBoundingClientRect()),
    })),
    interactive,
    blocks,
    orientationRules: orientationRules.slice(0, 20),
  };
}

// Draws numbered boxes (and the crease, when given) over the page for a
// screenshot. Also runs in the page.
export function drawMarks({ marks, foldX }) {
  document.getElementById('__duo_ready_marks')?.remove();
  const layer = document.createElement('div');
  layer.id = '__duo_ready_marks';
  layer.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  if (foldX != null) {
    const fold = document.createElement('div');
    fold.style.cssText =
      `position:absolute;left:${foldX - 1}px;top:0;width:2px;height:${height}px;` +
      'background:repeating-linear-gradient(#f0a 0 8px,transparent 8px 14px);';
    layer.appendChild(fold);
  }
  marks.forEach((m, i) => {
    const color = m.severity === 'error' ? '#e11' : '#e80';
    const b = document.createElement('div');
    b.style.cssText =
      `position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;` +
      `outline:2px solid ${color};outline-offset:1px;background:${color}22;`;
    const tag = document.createElement('span');
    tag.textContent = String(i + 1);
    // Above the box, or inside it when the box is at the top of the page.
    const above = m.y >= 20;
    tag.style.cssText =
      `position:absolute;left:${above ? -2 : 2}px;top:${above ? -18 : 2}px;font:bold 11px/16px system-ui,sans-serif;` +
      `color:#fff;background:${color};padding:0 4px;border-radius:3px;`;
    b.appendChild(tag);
    layer.appendChild(b);
  });
  document.documentElement.appendChild(layer);
}

export function clearMarks() {
  document.getElementById('__duo_ready_marks')?.remove();
}
