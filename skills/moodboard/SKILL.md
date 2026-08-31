---
name: moodboard
description: 複数画像(PNG/WebP/animated GIF)をライトテーブルで見せる標準手段。生成画像・比較検証用の画像をユーザーに見せる/比較させるときは常にこれを使う(mpv 複数ウィンドウ方式の後継)。「画像見せて」「moodboard で開いて」「並べて比較」などで発火。
---

# moodboard — 複数画像ビューア(ライトテーブル)

`moodboard` コマンド(bun + webview-bun の WKWebView 窓)で開く。**サーバもブラウザも不要**。

## 開き方(この 1 コマンドだけ)

```sh
command -v moodboard >/dev/null || bun install -g github:mohhh-ok/moodboard
pkill -f "moodboard" 2>/dev/null || true
sleep 0.2
nohup moodboard <画像パス...> >/tmp/moodboard.log 2>&1 & disown
```

- **`nohup`+`disown` 必須**(素の `&` はツール呼び出し終了と一緒に窓が死ぬ)
- 先頭の pkill は窓溜まり防止。前の窓を残して見比べたい文脈では省く
- パスは相対でもよい(内部で resolve + encodeURIComponent する)。スペース・日本語可

## 絶対にやらないこと

- **`open "file://...?クエリ"` 禁止**。macOS の LaunchServices がクエリを落とし空表示になる(実害あり)
- **Playwright MCP でこのビューアを開かない**(file: ブロックあり。かつ Chrome チャネル起動で
  ユーザーの Chrome と衝突した実害あり)。検証は下記の playwright-core 方式
- 表示した画像を勝手に `rm` しない

## UI 仕様

- **wheel** = カーソル位置を不動点に画像自体をリサイズ(上=拡大。Google Maps と同じ向き。ピンチ対応)
- **drag** = 自由移動(クリッピングなし。重ねて比較可。掴んだものが最前面)
- **click**(ドラッグなしの素のクリック)= ライトボックス(`0`=fit `1`=物理等倍 `2`=200% `←/→`=前後 `Esc`=閉じる)
- `r` = 再整列 / `b` = 背景切替(ダーク→市松→白。透過確認は市松) / slider・`+`/`-` = 基準サイズ
- 物理 200% 以上で自動 `image-rendering: pixelated`(ドット検品用)

## ビューアを変更したときの検証

合成 dispatchEvent はネイティブ挙動(画像のゴーストドラッグ等)を再現できず素通りする(実害あり)。
**実マウス入力**で検証する: playwright-core +
`~/Library/Caches/ms-playwright/chromium-*` の headless Chromium(executablePath 指定)で
`page.mouse.down/move/up`・`page.mouse.wheel` を使う。Playwright は file: を開けないので、
検証時のみ `bun -e 'Bun.serve(...)'` で / を配信するローカルサーバを立てて http で開く
(moodboard.html の `toImgSrc` が file/http 両対応)。検証が済んだら `lsof -ti:<port> | xargs kill`。

## 備考

- webview-bun の WKWebView は file:// のクエリ保持・全ディレクトリの画像読み込みとも実測で確認済み
- 窓を閉じればプロセスも終わる。残った場合は `pkill -f moodboard`
- インストール・実装の詳細は [README](https://github.com/mohhh-ok/moodboard)
