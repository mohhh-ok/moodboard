#!/usr/bin/env bun
// moodboard.html を webview-bun のウィンドウで開くランチャー。サーバ・ブラウザ不要。
// file:// のクエリも別ディレクトリの画像読み込みも WKWebView 上で通ることは実測済み。
// nohup + disown で起動しないとツール呼び出しの終了と一緒に窓が死ぬ(README 参照)。
import { Webview, SizeHint } from "webview-bun";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: moodboard <画像パス...>");
  process.exit(1);
}

const htmlPath = resolve(dirname(fileURLToPath(import.meta.url)), "moodboard.html");
const url =
  "file://" +
  htmlPath.split("/").map(encodeURIComponent).join("/") +
  "?f=" +
  files.map((p) => encodeURIComponent(resolve(p))).join("&f=");

const webview = new Webview();
webview.title = "moodboard";
webview.size = { width: 1280, height: 900, hint: SizeHint.NONE };
webview.navigate(url);
webview.run(); // ウィンドウを閉じると返る
