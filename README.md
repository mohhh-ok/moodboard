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
moodboard <image paths...>
```

- Paths may be relative or absolute (resolved and `encodeURIComponent`-ed internally). Spaces and non-ASCII characters are fine
- Closing the window ends the process

When launching from an agent, use `nohup` + `disown` so the window survives the end of the tool call.

```sh
pkill -f "bin/moodboard" 2>/dev/null || true
sleep 0.2
nohup moodboard <image paths...> >/tmp/moodboard.log 2>&1 & disown
```

- The leading `pkill` closes the previous window. Skip it if you want to keep the old window for comparison.
  The pattern is `bin/moodboard` rather than `moodboard` so it does not kill unrelated processes such as an editor that has this repository open
- A leftover window can be closed with `pkill -f "bin/moodboard"`

## UI

- **wheel** = resize the image itself, keeping the point under the cursor fixed (up = zoom in, same direction as Google Maps; pinch supported)
- **drag** = free movement (no clipping; images may overlap for comparison; the grabbed image comes to the front)
- **click** (a plain click without dragging) = lightbox
  - inside the lightbox: `0` = fit, `1` = physical 1:1, `2` = 200%, `←/→` = previous/next, `m` = toggle sound, `Esc` = close
- `r` = re-align / `b` = cycle background (dark → checkerboard → white; use checkerboard to check transparency) / slider, `+`/`-` = base size
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

- `moodboard.ts` resolves `moodboard.html` next to itself via `import.meta.dir`, appends `?f=<encodeURIComponent(absolute path)>` for each image to the `file://` URL, and hands it to webview-bun
- webview-bun resolves its dylib/so through a package-relative import (`../build/libwebview.dylib` etc.), so it works under a global install as well (it reads from `node_modules/webview-bun/build/`)
- Verified on macOS (WKWebView) only. webview-bun ships Linux/Windows binaries too, but those have not been tested

## License

MIT
