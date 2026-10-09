import { stateName } from './checks.mjs';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Markdown for a CI job summary (GitHub's $GITHUB_STEP_SUMMARY).
export function renderMarkdown(report) {
  const { errors, warnings, notes } = report.summary;
  const icon = { error: '🔴', warn: '🟠', info: '🔵' };
  const lines = [
    `### iphone-duo-check: ${errors ? plural(errors, 'error') : 'no errors'} on ${report.url}`,
    '',
    `${plural(errors, 'error')} · ${plural(warnings, 'warning')} · ${plural(notes, 'note')} · iPhone Duo folded ` +
      `${report.sizes.folded.width}×${report.sizes.folded.height}, open ${report.sizes.open.width}×${report.sizes.open.height}`,
    '',
  ];
  for (const f of report.findings) {
    lines.push(`**${icon[f.severity]} ${f.title}** (${stateName(f.state)})`, '');
    for (const i of f.items) lines.push(`- \`${i.label.replace(/`/g, "'")}\``);
    if (f.items.length) lines.push('');
    lines.push(`Fix: ${f.fix}`, '');
  }
  if (!report.findings.length) lines.push('Nothing found: ready for iPhone Duo.', '');
  return lines.join('\n');
}
