# moodboard

A single-command image/video viewer that lays out multiple images (PNG / WebP / animated GIF) or videos (mov / webm / mp4, matched by extension) on a light table so you can compare them side by side.
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
moodboard [--target <name>] <image paths...>
moodboard --close <name>
moodboard --list
```

- `--target` works like `target="xxx"` in HTML: if a window with that name is open, its contents are replaced (the window keeps its position); otherwise a new window opens under that name. The name is also the window title. Names may contain letters, digits and `. _ -`
- Without `--target`, every call opens a new window
- `--close <name>` closes only that window. `--list` prints the open named windows
- Paths may be relative or absolute. Spaces and non-ASCII characters are fine

The launcher opens the window in a detached child process (its own session), waits until the page reports that every image has settled, then exits. Run it in the foreground; no `nohup` / `&` / `disown` is needed, and the window survives the end of an agent's tool call. The exit code tells whether the window is really showing the images:

| code | meaning |
| --- | --- |
| 0 | shown; prints `opened target=<name> pid=<pid> 新規\|差し替え images=<n>` |
| 1 | bad arguments or a missing path |
| 2 | not confirmed within 20 s (for a new window, the log path is printed) |
| 3 | shown, but some images failed to load (listed) |

When several agents share one machine, give each project its own name (e.g. the project directory name). Never close windows with `pkill`; that also closes other projects' windows.

State lives in `/tmp/moodboard/` (`targets/<name>.pid`, pending replace requests, acks, and logs of new windows).

## UI

- **wheel** = resize the image itself, keeping the point under the cursor fixed (up = zoom in, same direction as Google Maps; pinch supported)
- **drag** = free movement (no clipping; images may overlap for comparison; the grabbed image comes to the front)
- **click** (a plain click without dragging) = lightbox
  - inside the lightbox: `0` = fit, `1` = physical 1:1, `2` = 200%, `←/→` = previous/next, `m` = toggle sound, `Esc` = close
- `r` = re-align / `b` = cycle background (dark → checkerboard → white; use checkerboard to check transparency) / slider, `+`/`-` = base size
- `s` = toggle selection mode. In selection mode a checkbox appears on each item and a click toggles it; the "コピー" button copies the **absolute paths of the selected items, newline-separated**, to the clipboard. `⌘/Ctrl+A` = select all, `⌘/Ctrl+C` = copy, `Esc` = leave selection mode. Useful for pulling paths out of what you laid out and piping them into another command
- At 200% physical scale or larger, `image-rendering: pixelated` is applied automatically (for pixel-level inspection)
- Videos (mov/webm/mp4) play autoplay/muted/looped in place and support the same wheel/drag/lightbox controls as images. The light table is always muted (several videos playing sound at once is noise); sound plays one video at a time in the lightbox, on by default, `m` toggles mute. HEVC alpha `.mov` plays in WKWebView; VP9 alpha `.webm` may not — a failed item shows "再生不可" plus the filename instead of crashing

## Never do this

- **Do not open it with `open "file://...?query"`**. macOS LaunchServices drops the query string and you get an empty page
- **Do not open it with the Playwright MCP** (the `file:` protocol is blocked, and launching the Chrome channel can collide with the user's own Chrome). For verification, use the method under "Verifying changes to the viewer"
- Do not `rm` the images you displayed

## Verifying changes to the viewer

Synthetic `dispatchEvent` calls do not reproduce native behaviour (ghost image drag etc.) and let implementation bugs slip through.
Verify with **real mouse input**: playwright-core + headless Chromium (point `executablePath` at `~/Library/Caches/ms-playwright/chromium-*`) using `page.mouse.down/move/up` and `page.mouse.wheel`.

Playwright cannot open `file:` URLs, so for verification only, serve the current directory with something like `bun -e 'Bun.serve(...)'` and open it over `http://` (`toImgSrc` in `moodboard.html` handles both file and http).
Stop the server afterwards with `lsof -ti:<port> | xargs kill`.

## Use as an Agent Skill

This repository ships an [Agent Skills](https://github.com/anthropics/skills) skill at `skills/moodboard/SKILL.md`. Install it with:

```sh
npx skills add mohhh-ok/moodboard
```

Then, when you want your coding agent to show you images, saying "open it in moodboard" triggers the launch command above.

## Implementation notes

- `moodboard.ts` resolves `moodboard.html` next to itself, appends `?rid=<request id>&f=<encodeURIComponent(absolute path)>...` to the `file://` URL, and hands it to webview-bun in a detached child (`moodboard.ts --window <config>`)
- The page reports readiness through the bound `__moodboardReady(rid, failedPaths)`; the child writes it to `/tmp/moodboard/acks/<rid>.json`, which the launcher waits for
- Replacing a named window: the launcher writes `/tmp/moodboard/targets/<name>.request.json`; the page polls the bound `__moodboardPoll()` every 500 ms and `location.replace`s to the new URL. Polling from the page is needed because Bun's event loop does not run while `webview.run()` owns the thread
- webview-bun resolves its dylib/so through a package-relative import (`../build/libwebview.dylib` etc.), so it works under a global install as well (it reads from `node_modules/webview-bun/build/`)
- Verified on macOS (WKWebView) only. webview-bun ships Linux/Windows binaries too, but those have not been tested

## License

MIT
