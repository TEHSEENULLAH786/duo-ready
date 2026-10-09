#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { appendFile } from 'node:fs/promises';
import { checkUrl } from '../src/run.mjs';
import { stateName } from '../src/checks.mjs';
import { renderMarkdown } from '../src/report-md.mjs';

const HELP = `iphone-duo-check: check a website for iPhone Duo layout problems

Usage: iphone-duo-check <url> [options]

Options:
  -o, --out <dir>      Report folder (default: iphone-duo-check-report)
      --no-report      Don't write report files, only print
      --json           Print the report as JSON
      --summary <file> Also append a Markdown summary to <file> (for CI)
      --strict         Exit 1 on warnings as well as errors
      --engine <name>  webkit (default, Safari's engine) or chromium
      --timeout <ms>   Page load timeout (default 30000)
      --settle <ms>    Wait after load and after opening (default 800)
  -h, --help           Show this help

Exit code: 0 = no errors, 1 = errors found (or warnings with --strict), 2 = could not run.`;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o', default: 'iphone-duo-check-report' },
      'no-report': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      summary: { type: 'string' },
      strict: { type: 'boolean', default: false },
      engine: { type: 'string', default: 'webkit' },
      timeout: { type: 'string', default: '30000' },
      settle: { type: 'string', default: '800' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
} catch (err) {
  console.error(err.message + '\n\n' + HELP);
  process.exit(2);
}

const { values, positionals } = args;
if (values.help || !positionals.length) {
  console.log(HELP);
  process.exit(values.help ? 0 : 2);
}

let url = positionals[0];
if (!/^[a-z]+:\/\//i.test(url)) url = (/^(localhost|127\.|\[::1\])/.test(url) ? 'http://' : 'https://') + url;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s) => paint('31', s);
const yellow = (s) => paint('33', s);
const blue = (s) => paint('34', s);
const dim = (s) => paint('2', s);
const bold = (s) => paint('1', s);

const outDir = values['no-report'] ? null : resolve(values.out);

let report;
try {
  if (!values.json) console.log(dim(`Checking ${url} at iPhone Duo sizes (${values.engine})…`));
  report = await checkUrl(url, {
    outDir,
    engine: values.engine,
    timeout: Number(values.timeout),
    settle: Number(values.settle),
  });
} catch (err) {
  console.error(red('iphone-duo-check: ') + err.message);
  process.exit(2);
}

if (values.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const tag = { error: red('✖ error  '), warn: yellow('▲ warning'), info: blue('● note   ') };
  console.log('');
  for (const f of report.findings) {
    console.log(`${tag[f.severity]} ${bold(f.title)} ${dim('(' + stateName(f.state) + ')')}`);
    for (const i of f.items.slice(0, 5)) console.log(dim('            ' + i.label));
    if (f.items.length > 5) console.log(dim(`            …and ${f.items.length - 5} more`));
    console.log('            ' + f.fix);
    console.log('');
  }
  const { errors, warnings, notes } = report.summary;
  if (!report.findings.length) console.log(bold('Ready for iPhone Duo: nothing found.'));
  else console.log(bold(`${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}, ${notes} note${notes === 1 ? '' : 's'}`));
  if (outDir) console.log(dim('Report: ') + join(outDir, 'report.html'));
}

if (values.summary) await appendFile(values.summary, renderMarkdown(report) + '\n');

const failed = report.summary.errors > 0 || (values.strict && report.summary.warnings > 0);
process.exit(failed ? 1 : 0);
