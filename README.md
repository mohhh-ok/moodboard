# moodboard

A single-command viewer that lays out multiple images (PNG / WebP / animated GIF), videos (mov / webm / mp4) or audio files (wav / mp3 / m4a / aac / flac / ogg / opus) — matched by extension — on a light table so you can compare them side by side. Items can be grouped into sections (a heading plus a note) and each card can carry a label.
Runs in a WKWebView window via bun + [webview-bun](https://github.com/tr1ckydev/webview-bun). No server, no browser.

Built primarily for coding agents (Claude Code etc.) to show generated images or comparison candidates to the user.
The whole thing is `moodboard.html` (self-contained HTML/CSS/JS, zero external dependencies) plus `moodboard.ts` (the webview-bun launcher).

## Install

```sh
bun install -g github:mohhh-ok/moodboard
```

This puts a `moodboard` command on your PATH.

## Usage

```sh
moodboard [--target <name>] <paths...>
moodboard [--target <name>] --json <board.json>
moodboard --close <name>
moodboard --list
```

- `--target` works like `target="xxx"` in HTML: if a window with that name is open, its contents are replaced (the window keeps its position); otherwise a new window opens under that name. The name is also the window title. Names may contain letters, digits and `. _ -`
- Without `--target`, every call opens a new window
- `--close <name>` closes only that window. `--list` prints the open named windows
- Paths may be relative or absolute. Spaces and non-ASCII characters are fine
- `--json <board.json>` takes a JSON file that groups items into sections and labels each card (format below). Write the file somewhere like `/tmp/<project>/` and pass its path. Passing both `--json` and paths is an error

### Board JSON

```json
{
  "sections": [
    {
      "title": "take A",
      "note": "The script these takes were read from.\nNewlines are kept.",
      "items": [
        { "path": "/tmp/project/take_prod.wav", "label": "current production" },
        { "path": "take_2.wav", "label": "retake 2" }
      ]
    }
  ]
}
```

- `sections` (required, non-empty) — each section is laid out as one block: heading, note, then its cards
- `title`, `note` (optional) — the heading and the text under it
- `items` (required, non-empty) — `path` (required) is absolute or relative to the JSON file's directory; `label` (optional) is shown on the card, the file name is shown when omitted
- Unknown keys, wrong types, empty `sections`/`items` arrays and missing files are rejected with exit code 1 before any window opens
- Plain `moodboard <paths...>` is the same as one untitled section without labels

The launcher opens the window in a detached child process (its own session), waits until the page reports that every image has settled, then exits. Run it in the foreground; no `nohup` / `&` / `disown` is needed, and the window survives the end of an agent's tool call. The exit code tells whether the window is really showing the images:

| code | meaning |
| --- | --- |
| 0 | shown; prints `opened target=<name> pid=<pid> 新規\|差し替え images=<n>` |
| 1 | bad arguments, an invalid board JSON, or a missing path |
| 2 | not confirmed within 20 s (for a new window, the log path is printed) |
| 3 | shown, but some images failed to load (listed) |

When several agents share one machine, give each project its own name (e.g. the project directory name). Never close windows with `pkill`; that also closes other projects' windows.

State lives in `/tmp/moodboard-<uid>/` (mode 0700, owner checked on every run) (`targets/<name>.pid`, pending replace requests, acks, and logs of new windows).

## UI

- **wheel** = resize the image itself, keeping the point under the cursor fixed (up = zoom in, same direction as Google Maps; pinch supported)
- **drag** = free movement (no clipping; images may overlap for comparison; the grabbed image comes to the front)
- **click** (a plain click without dragging) = lightbox
  - inside the lightbox: `0` = fit, `1` = physical 1:1, `2` = 200%, `←/→` = previous/next, `m` = toggle sound, `Esc` = close
- `r` = re-align / `b` = cycle background (dark → checkerboard → white; use checkerboard to check transparency) / slider, `+`/`-` = base size. Resizing the window also re-aligns automatically (debounced), but only as long as no card has been manually dragged or wheel-resized since the last alignment — once you touch a card, auto re-align is skipped so it won't undo your placement, and only `r` re-aligns everything again
- `s` = toggle selection mode. In selection mode a checkbox appears on each item and a click toggles it; the "コピー" button copies the **absolute paths of the selected items, newline-separated**, to the clipboard. `⌘/Ctrl+A` = select all, `⌘/Ctrl+C` = copy, `Esc` = leave selection mode. Useful for pulling paths out of what you laid out and piping them into another command
- At 200% physical scale or larger, `image-rendering: pixelated` is applied automatically (for pixel-level inspection)
- Each card shows its label (or the file name) under the media. Sections are stacked top to bottom, each with its heading and note; `r` restores this layout
- Audio (wav/mp3/m4a/aac/flac/ogg/opus) is a player card on the light table: a play/pause button, a seek bar and elapsed/total time. Clicking the card (or the button) plays it in place; starting one pauses any other audio, so only one plays at a time. The card's height is fixed to fit the controls — base size and wheel only change its width, so it never turns into a tall empty box. A playing card gets a green border, a green tint on the card background and a green play button, so you can tell which one is playing even while it's also selected (the blue selection outline alone would otherwise cover the green border and make the card look plain blue). Audio cards can be dragged and resized like the others, but do not open the lightbox, and `←/→` in the lightbox skips them. Wheel-resizing an audio card keeps it from drifting to a negative x position (image/video wheel behaviour is unchanged) — near the left edge, the card's left side is clamped to the canvas edge instead of following the cursor past it, because past x=0 the card would land off the left of the page with no way to scroll back to it, taking the play button and label with it. In selection mode, clicking anywhere on the card — including the play button and seek bar — toggles selection instead of playing/seeking. A file that cannot be played shows "再生不可" plus the filename
- Videos (mov/webm/mp4) play autoplay/muted/looped in place and support the same wheel/drag/lightbox controls as images. The light table is always muted (several videos playing sound at once is noise); sound plays one video at a time in the lightbox, on by default, `m` toggles mute. Opening a video in the lightbox (or unmuting it there) pauses any light-table audio card that's currently playing, so only one thing makes sound at a time. HEVC alpha `.mov` plays in WKWebView; VP9 alpha `.webm` may not — a failed item shows "再生不可" plus the filename instead of crashing

## Never do this

- **Do not open it with `open "file://...?query"`**. macOS LaunchServices drops the query string and you get an empty page
- **Do not open it with the Playwright MCP** (the `file:` protocol is blocked, and launching the Chrome channel can collide with the user's own Chrome). For verification, use the method under "Verifying changes to the viewer"
- Do not `rm` the images you displayed

## Verifying changes to the viewer

Synthetic `dispatchEvent` calls do not reproduce native behaviour (ghost image drag etc.) and let implementation bugs slip through.
Verify with **real mouse input**: playwright-core + headless Chromium (point `executablePath` at `~/Library/Caches/ms-playwright/chromium-*`) using `page.mouse.down/move/up` and `page.mouse.wheel`.

Playwright cannot open `file:` URLs, so for verification only, serve the filesystem root on localhost with something like `bun -e 'Bun.serve(...)'` and open `moodboard.html?rid=<id>` over `http://` (`toImgSrc` in `moodboard.html` turns absolute paths into server-root paths, so the server must serve `/`).
The page gets its board from the host, so provide the bound functions yourself with `page.exposeFunction`: `__moodboardLoad(rid)` returns the board object, `__moodboardReady(rid, failedPaths)` receives the ack, and `__moodboardPoll()` returns `null`.
Stop the server afterwards with `lsof -ti:<port> | xargs kill`.

## Use as an Agent Skill

This repository ships an [Agent Skills](https://github.com/anthropics/skills) skill at `skills/moodboard/SKILL.md`. Install it with:

```sh
npx skills add mohhh-ok/moodboard
```

Then, when you want your coding agent to show you images, saying "open it in moodboard" triggers the launch command above.

## Implementation notes

- `moodboard.ts` turns the arguments (a path list or a validated `--json` file) into one board object with absolute paths, writes it to `/tmp/moodboard-<uid>/boards/<rid>.json`, and hands `moodboard.html?rid=<request id>` to webview-bun in a detached child (`moodboard.ts --window <config>`). The page reads the board through the bound `__moodboardLoad(rid)`. Nothing but the request id goes into the URL, so long notes and many paths never hit a URL length limit
- The page reports readiness through the bound `__moodboardReady(rid, failedPaths)`; the child writes it to `/tmp/moodboard-<uid>/acks/<rid>.json`, which the launcher waits for
- Board files under `boards/` don't accumulate: `__moodboardLoad` deletes its file right after reading it. On a failed/unconfirmed open (timeout waiting for the ack), the launcher only deletes the request/board files when the window hasn't picked up the request yet (checked via the target's request file still existing); if the window has already picked it up and may be mid-load, the launcher leaves the board file alone so a late-but-successful load doesn't fail — the window's own `__moodboardLoad` cleans it up whenever it runs. The window process also deletes its own initial board file on exit as a last-resort sweep (later boards loaded via a target replace are already gone by then, each cleaned up by its own `__moodboardLoad` call). Anything left over after all of that (a window that truly crashed, etc.) is swept at the next launcher invocation if it's older than several times the ack timeout. If `__moodboardLoad` itself fails, the page shows a distinct "failed to load" state instead of the empty state, so a load failure is never silently indistinguishable from "no items"
- Replacing a named window: the launcher writes `/tmp/moodboard-<uid>/targets/<name>.request.json`; the page polls the bound `__moodboardPoll()` every 500 ms and `location.replace`s to the new URL. Polling from the page is needed because Bun's event loop does not run while `webview.run()` owns the thread
- webview-bun resolves its dylib/so through a package-relative import (`../build/libwebview.dylib` etc.), so it works under a global install as well (it reads from `node_modules/webview-bun/build/`)
- Verified on macOS (WKWebView) only. webview-bun ships Linux/Windows binaries too, but those have not been tested

## License

MIT
