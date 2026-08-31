# moodboard

複数画像(PNG/WebP/animated GIF)をライトテーブルに並べて見比べるための、単一コマンドの画像ビューア。
bun + [webview-bun](https://github.com/tr1ckydev/webview-bun) の WKWebView 窓で開く。サーバもブラウザも不要。

コーディングエージェント(Claude Code 等)が生成物・比較検証用の画像をユーザーに見せる用途を主眼に作った。
実体は `moodboard.html`(自己完結 HTML/CSS/JS、外部依存ゼロ)+ `moodboard.ts`(webview-bun ランチャー)。

## インストール

```sh
bun install -g github:mohhh-ok/moodboard
```

`moodboard` コマンドが使えるようになる。

## 使い方

```sh
moodboard <画像パス...>
```

- パスは相対・絶対どちらでもよい(内部で resolve + encodeURIComponent する)。スペース・日本語可
- 窓を閉じればプロセスも終わる

エージェントから使う場合は、ツール呼び出しの終了と一緒に窓が死なないよう `nohup` + `disown` で起動する。

```sh
pkill -f "bin/moodboard" 2>/dev/null || true
sleep 0.2
nohup moodboard <画像パス...> >/tmp/moodboard.log 2>&1 & disown
```

- 先頭の `pkill` は前の窓を掃除するため。前の窓を残して見比べたい場合は省く。
  パターンを `bin/moodboard` にしているのは、`moodboard` だけだとリポジトリを開いているエディタ等の無関係なプロセスまで巻き込むため
- 残った場合は `pkill -f "bin/moodboard"` で終了できる

## UI 仕様

- **wheel** = カーソル位置を不動点に画像自体をリサイズ(上=拡大。Google Maps と同じ向き。ピンチ対応)
- **drag** = 自由移動(クリッピングなし。重ねて比較可。掴んだものが最前面)
- **click**(ドラッグなしの素のクリック)= ライトボックス表示
  - ライトボックス内: `0`=fit `1`=物理等倍 `2`=200% `←/→`=前後 `Esc`=閉じる
- `r` = 再整列 / `b` = 背景切替(ダーク→市松→白。透過確認は市松) / スライダー・`+`/`-` = 基準サイズ
- 物理 200% 以上で自動 `image-rendering: pixelated`(ドット検品用)

## 絶対にやらないこと

- **`open "file://...?クエリ"` で開かない**。macOS の LaunchServices がクエリを落とし空表示になる
- **Playwright MCP で開かない**(file: プロトコルがブロックされる。Chrome チャネル起動でユーザーの
  Chrome と衝突する場合もある)。検証は下記「ビューアを変更したときの検証」の方式を使う
- 表示した画像を勝手に `rm` しない

## ビューアを変更したときの検証

合成 `dispatchEvent` はネイティブ挙動(画像のゴーストドラッグ等)を再現できず、実装のバグを素通りさせる。
**実マウス入力**で検証する: playwright-core + headless Chromium(`~/Library/Caches/ms-playwright/chromium-*`
を `executablePath` に指定)で `page.mouse.down/move/up`・`page.mouse.wheel` を使う。

Playwright は `file:` を開けないため、検証時のみ `bun -e 'Bun.serve(...)'` などでカレントディレクトリを
配信するローカルサーバを立てて `http://` 経由で開く(`moodboard.html` の `toImgSrc` は file/http 両対応)。
検証が済んだら `lsof -ti:<port> | xargs kill` でサーバを止める。

## Agent Skill として使う

このリポジトリには [Agent Skills](https://github.com/anthropics/skills) 形式のスキルが同梱されている
(`skills/moodboard/SKILL.md`)。以下で取り込める。

```sh
npx skills add mohhh-ok/moodboard
```

コーディングエージェントに画像を見せたいとき、「moodboard で開いて」と言えば上記の起動コマンドが実行される。

## 実装メモ

- `moodboard.ts` は `import.meta.dir` 基準で同ディレクトリの `moodboard.html` を解決し、
  `file://` URL に `?f=<encodeURIComponent(絶対パス)>` を繰り返し付与して webview-bun に渡す
- webview-bun 側の dylib/so 解決はパッケージ内相対 import(`../build/libwebview.dylib` 等)で完結しており、
  global install でも動作する(`node_modules/webview-bun/build/` 配下を参照)

## ライセンス

MIT
