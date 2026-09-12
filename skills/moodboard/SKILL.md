---
name: moodboard
description: 複数画像(PNG/WebP/animated GIF)や動画(mov/webm/mp4)をライトテーブルで見せる標準手段。生成画像・比較検証用の画像/動画をユーザーに見せる/比較させるときは常にこれを使う(mpv 複数ウィンドウ方式の後継)。「画像見せて」「moodboard で開いて」「並べて比較」などで発火。
---

# moodboard — 複数画像/動画ビューア(ライトテーブル)

`moodboard` コマンド(bun + webview-bun の WKWebView 窓)で開く。**サーバもブラウザも不要**。

## 開き方(この 1 コマンドだけ)

```sh
command -v moodboard >/dev/null || bun install -g github:mohhh-ok/moodboard
pkill -f "bin/moodboard" 2>/dev/null || true
sleep 0.2
nohup moodboard <画像パス...> >/tmp/moodboard.log 2>&1 & disown
```

- **`nohup`+`disown` 必須**(素の `&` はツール呼び出し終了と一緒に窓が死ぬ)
- 先頭の pkill は窓溜まり防止。前の窓を残して見比べたい文脈では省く
- パスは相対でもよい(内部で resolve + encodeURIComponent する)。スペース・日本語可

## 絶対にやらないこと

- **`open "file://...?クエリ"` 禁止**。macOS の LaunchServices がクエリを落とし空表示になる(実害あり)
- **Playwright MCP でこのビューアを開かない**(file: ブロックあり。かつ Chrome チャネル起動で
  ユーザーの Chrome と衝突した実害あり)
- 表示した画像を勝手に `rm` しない

## UI 仕様

- **wheel** = カーソル位置を不動点に画像自体をリサイズ(上=拡大。Google Maps と同じ向き。ピンチ対応)
- **drag** = 自由移動(クリッピングなし。重ねて比較可。掴んだものが最前面)
- **click**(ドラッグなしの素のクリック)= ライトボックス(`0`=fit `1`=物理等倍 `2`=200% `←/→`=前後 `m`=音の切替 `Esc`=閉じる)
- `r` = 再整列 / `b` = 背景切替(ダーク→市松→白。透過確認は市松) / slider・`+`/`-` = 基準サイズ
- 物理 200% 以上で自動 `image-rendering: pixelated`(ドット検品用)
- 動画(mov/webm/mp4、拡張子判定)は自動再生・ミュート・ループで表示され、上記の操作すべてが画像と同じに効く。ライトテーブル上は常にミュート(複数同時に鳴るとうるさい)で、音はライトボックスで 1 本ずつ出る(既定で音あり・`m` でミュート切替)。声・台詞の検品はライトボックスで行う。alpha 付き待機ループ動画の見比べに使える(市松背景で透過確認)。HEVC alpha の `.mov` は再生できるが、VP9 alpha の `.webm` は再生できないことがあり、その場合は「再生不可」+ファイル名の表示になる

## 備考

- 窓を閉じればプロセスも終わる。残った場合は `pkill -f "bin/moodboard"`
- ビューア本体の変更・検証手順は [README](https://github.com/mohhh-ok/moodboard)
