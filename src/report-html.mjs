import { stateName } from './checks.mjs';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Item numbers match the numbered boxes on each screenshot: they count per
// screenshot, in finding order, and skip items with no box.
function numberItems(findings) {
  const next = { folded: 0, unfolded: 0, open: 0 };
  return findings.map((f) => ({
    ...f,
    items: f.items.map((i) => ({ ...i, n: i.w ? ++next[f.state] : null })),
  }));
}

export function renderHtml(report) {
  const findings = numberItems(report.findings);
  const { errors, warnings, notes } = report.summary;
  const verdict = errors
    ? `${errors} problem${errors === 1 ? '' : 's'} to fix`
    : warnings
      ? 'No blocking problems'
      : 'Ready for iPhone Duo';

  const shots = [
    ['folded', `Folded · ${report.sizes.folded.width}×${report.sizes.folded.height}`],
    ['unfolded', `Opened from folded · ${report.sizes.open.width}×${report.sizes.open.height}`],
    ['open', `Fresh load, open · ${report.sizes.open.width}×${report.sizes.open.height}`],
  ].filter(([k]) => report.screenshots[k]);

  const findingHtml = findings
    .map(
      (f) => `
    <article class="finding ${f.severity}">
      <header><span class="sev">${{ error: 'Error', warn: 'Warning', info: 'Note' }[f.severity]}</span>
        <h3>${esc(f.title)}</h3><span class="where">${esc(stateName(f.state))}</span></header>
      <p>${esc(f.detail)}</p>
      <p class="fix"><strong>Fix:</strong> ${esc(f.fix)}</p>
      ${
        f.items.length
          ? `<ul>${f.items
              .map((i) => `<li>${i.n ? `<span class="n">${i.n}</span>` : ''}<code>${esc(i.label)}</code></li>`)
              .join('')}</ul>`
          : ''
      }
    </article>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>iphone-duo-check · ${esc(report.url)}</title>
<style>
:root { --bg:#f6f6f4; --fg:#18181b; --muted:#6b6b70; --card:#fff; --line:#e4e4e0;
  --error:#d11; --warn:#c70; --info:#36c; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg:#111113; --fg:#ececee; --muted:#9a9aa0;
  --card:#1b1b1e; --line:#2c2c30; --error:#f55; --warn:#fa4; --info:#7af; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui,-apple-system,sans-serif; }
main { max-width:1200px; margin:0 auto; padding:32px 16px 64px; }
h1 { font-size:28px; margin:0 0 4px; } h2 { font-size:18px; margin:40px 0 12px; }
.url { color:var(--muted); word-break:break-all; margin:0; }
.counts { display:flex; gap:8px; flex-wrap:wrap; margin:16px 0 0; }
.counts span { padding:4px 10px; border-radius:999px; background:var(--card); border:1px solid var(--line); }
.shots { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:16px; align-items:start; }
figure { margin:0; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px; }
figure img { width:100%; height:auto; display:block; border-radius:6px; border:1px solid var(--line); }
figcaption { font-size:13px; color:var(--muted); margin-top:8px; }
.finding { background:var(--card); border:1px solid var(--line); border-left:4px solid var(--info);
  border-radius:10px; padding:14px 16px; margin:0 0 12px; }
.finding.error { border-left-color:var(--error); } .finding.warn { border-left-color:var(--warn); }
.finding header { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
.finding h3 { margin:0; font-size:16px; flex:1; min-width:200px; }
.sev { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
.error .sev { color:var(--error); } .warn .sev { color:var(--warn); } .info .sev { color:var(--info); }
.where { font-size:12px; color:var(--muted); }
.finding p { margin:8px 0 0; } .fix { color:var(--muted); }
.finding ul { margin:10px 0 0; padding:0; list-style:none; display:grid; gap:4px; }
.finding li { display:flex; gap:8px; align-items:baseline; min-width:0; }
.finding code { font-size:13px; overflow-wrap:anywhere; }
.n { font-size:11px; font-weight:700; color:#fff; background:var(--warn); border-radius:3px; padding:0 5px; }
.error .n { background:var(--error); }
.empty { color:var(--muted); }
footer { margin-top:40px; font-size:13px; color:var(--muted); }
</style></head>
<body><main>
<h1>${esc(verdict)}</h1>
<p class="url">${esc(report.url)}</p>
<div class="counts"><span>${errors} errors</span><span>${warnings} warnings</span><span>${notes} notes</span></div>
${
  shots.length
    ? `<h2>Screens</h2><div class="shots">${shots
        .map(([k, cap]) => `<figure><img src="${esc(report.screenshots[k])}" alt="${esc(cap)}"><figcaption>${esc(cap)}${k !== 'folded' ? ' · dashed line = fold' : ''}</figcaption></figure>`)
        .join('')}</div>`
    : ''
}
<h2>Findings</h2>
${findingHtml || '<p class="empty">Nothing found.</p>'}
<footer>
Checked ${esc(report.checkedAt)} in ${esc(report.engine === 'webkit' ? 'WebKit (Safari’s engine; close to, but not the same as, Safari on the phone)' : report.engine)}.
Screen sizes are third-party estimates until Apple publishes them. Made with iphone-duo-check.
</footer>
</main></body></html>
`;
}
