# iphone-duo-check

Checks a website for iPhone Duo layout problems and tells you what to fix.
It doesn't just show a preview: it opens the page the way the phone does and
reports what broke, with marked screenshots.

```
npx iphone-duo-check https://example.com
```

```
✖ error   Layout does not update when the phone opens (after opening)
            div#stale: 466px, should be 890px
            Do not cache window.innerWidth or screen.width at start-up. …

▲ warning 1 control sits on the fold (open)
            button#fold-btn
```

## What it checks

The page is loaded three times in WebKit (Safari's engine): folded, then
opened from folded, then fresh at the open size.

| Check | Level | What it means |
|---|---|---|
| Viewport meta | error | No `width=device-width`, so Safari shrinks a 980px page onto the screen. |
| Sideways scroll | error | Something is wider than the folded (or open) screen. |
| Layout doesn't update on open | error | After the phone opens, elements keep a different width than a fresh load. The page measured the screen once. This is the most common Duo bug. |
| Controls on the fold | warning | Small buttons or links on the crease down the middle of the open screen. Safari doesn't move them aside the way iOS does for native apps. |
| Small tap targets | warning | Under 44×44 both ways, or under 24px either way, on the folded screen. Links inside sentences are exempt. |
| Orientation media queries | note | The open Duo is wider than tall while held upright, so `(orientation: landscape)` matches. |

Safari can't tell a page where the fold is (it has no Viewport Segments
support), so a site can only respond to the size. iphone-duo-check tests exactly
that.

## Usage

```
iphone-duo-check <url> [options]

  -o, --out <dir>      Report folder (default: iphone-duo-check-report)
      --no-report      Don't write report files, only print
      --json           Print the report as JSON
      --strict         Exit 1 on warnings as well as errors
      --engine <name>  webkit (default) or chromium
      --timeout <ms>   Page load timeout (default 30000)
      --settle <ms>    Wait after load and after opening (default 800)
```

`localhost` URLs work, so you can check a dev server. The report folder holds
`report.html` (screenshots with numbered marks), `report.json`, and
`folded.jpg` / `unfolded.jpg` / `open.jpg`.

Exit code `0` means no errors, `1` means errors were found (or warnings, with
`--strict`), and `2` means the check couldn't run. Use the exit code to fail a
CI job.

The first run needs the WebKit browser: `npx playwright install webkit`.

### GitHub Action

Check every pull request. Start your site, then point the action at it:

```yaml
- run: npm ci && npm run build && (npx serve dist -l 4200 &) && sleep 2
- uses: TEHSEENULLAH786/iphone-duo-check@v0
  with:
    url: http://localhost:4200
    # strict: true   # fail on warnings too
```

The findings appear in the job summary, and the report with screenshots is
uploaded as the `iphone-duo-check-report` artifact. Inputs: `url`, `strict`,
`engine`, `settle`, `report-name`. Outputs: `errors`, `warnings`.

### From code

```js
import { checkUrl } from 'iphone-duo-check';

const report = await checkUrl('http://localhost:4200', { outDir: null });
console.log(report.summary); // { errors, warnings, notes }
```

## Limits

- **Sizes are estimates.** Apple hasn't published CSS viewport sizes. iphone-duo-check
  uses the third-party figures of 466 × 678 folded and 890 × 626 open, with the
  crease at x = 445. They live in `src/devices.mjs`.
- **WebKit isn't iPhone Safari.** It's the same engine, but not the address bar,
  safe areas or real touch. Check on a device or the Xcode 27.1 iPhone Duo
  simulator before launch.
- **Pages that change on every load** (ads, random content) can produce
  false "doesn't update" reports. Run the check twice if one looks wrong.

## Development

```
npm install
npx playwright install webkit
npm test
```

## License

MIT
