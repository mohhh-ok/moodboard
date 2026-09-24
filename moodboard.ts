#!/usr/bin/env bun
// moodboard.html を webview-bun のウィンドウで開くランチャー。サーバ・ブラウザ不要。
// file:// のクエリも別ディレクトリの画像読み込みも WKWebView 上で通ることは実測済み。
//
// 使い方:
//   moodboard [--target <名前>] <画像パス...>   開く。同名ウィンドウがあれば中身を差し替える
//   moodboard --close <名前>                     その名前のウィンドウだけ閉じる
//   moodboard --list                             開いている名前付きウィンドウを出す
//
// ランチャーはウィンドウ用の子プロセスを別セッション(detached)で起動し、ページが全画像の読み込みを
// 終えた通知(ack)を受けてから終了する。終了コードで「本当に開けたか」が分かる:
//   0 = 表示済み / 1 = 引数・対象の誤り / 2 = 時間内に表示されなかった / 3 = 読み込めない画像があった
//
// 同名ウィンドウへの差し替えは、ページ側が bind した __moodboardPoll を定期的に呼び、
// ランチャーが置いた要求ファイルを受け取って location.replace する。webview.run() の間は
// Bun のイベントループが回らないため、Bun 側から能動的には呼べない。
import { Webview, SizeHint } from "webview-bun";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// TMPDIR はエージェントの実行環境ごとに違うことがあるため、全プロセスで共有できる固定の場所に置く
const STATE_DIR = "/tmp/moodboard";
const TARGETS_DIR = join(STATE_DIR, "targets");
const ACKS_DIR = join(STATE_DIR, "acks");
const LOGS_DIR = join(STATE_DIR, "logs");
const READY_TIMEOUT_MS = 20_000;
const ACK_POLL_MS = 100;
// 前の起動が受領待ち(最大 READY_TIMEOUT_MS)を終えるまで待てる長さ
const LOCK_WAIT_MS = READY_TIMEOUT_MS + 5_000;
const TARGET_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

const scriptPath = fileURLToPath(import.meta.url);
const htmlPath = resolve(dirname(scriptPath), "moodboard.html");

type WindowConfig = { target: string | null; url: string; requestId: string };
type Ack = { pid: number; failedPaths: string[] };

await main(process.argv.slice(2));

async function main(argv: string[]) {
  for (const dir of [TARGETS_DIR, ACKS_DIR, LOGS_DIR]) mkdirSync(dir, { recursive: true });

  if (argv[0] === "--window") {
    runWindow(JSON.parse(argv[1]) as WindowConfig);
    return;
  }
  if (argv[0] === "--close") {
    process.exit(closeTarget(requireTargetName(argv[1])));
  }
  if (argv[0] === "--list") {
    listTargets();
    return;
  }

  let target: string | null = null;
  let files = argv;
  if (argv[0] === "--target") {
    target = requireTargetName(argv[1]);
    files = argv.slice(2);
  }
  if (files.length === 0) usageError("画像パスがありません");
  process.exit(await openImages({ target, files }));
}

async function openImages(request: { target: string | null; files: string[] }): Promise<number> {
  const absolutePaths = request.files.map((p) => resolve(p));
  const missing = absolutePaths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    console.error("存在しないパス:\n" + missing.join("\n"));
    return 1;
  }

  if (request.target === null) return await showImages({ target: null, absolutePaths });

  // 同じ名前への起動が重なると、両方が「未オープン」と判断して窓が 2 つ開き、片方が pid ファイルから
  // 外れて閉じられなくなる。名前ごとのロックで確認〜受領待ちを直列にする
  const target = request.target;
  const lock = await acquireTargetLock(target);
  if (!lock) {
    console.error(`target=${target} のロックを取れませんでした (${lockPath(target)})`);
    return 2;
  }
  try {
    return await showImages({ target, absolutePaths });
  } finally {
    rmSync(lockPath(target), { recursive: true, force: true });
  }
}

async function showImages(request: { target: string | null; absolutePaths: string[] }): Promise<number> {
  const absolutePaths = request.absolutePaths;
  const requestId = randomUUID();
  const url = buildUrl({ absolutePaths, requestId });
  const label = request.target ?? "(名前なし)";
  const existingPid = request.target === null ? null : findWindowPid(request.target);

  let child: ReturnType<typeof spawn> | null = null;
  let logPath: string | null = null;
  if (existingPid !== null && request.target !== null) {
    // 宛先 pid を入れておき、別の窓(同名で後から開いた窓)が古い要求を拾わないようにする
    writeFileSync(requestPath(request.target), JSON.stringify({ requestId, url, pid: existingPid }));
  } else {
    logPath = join(LOGS_DIR, `${requestId}.log`);
    const logFd = openSync(logPath, "a");
    const config: WindowConfig = { target: request.target, url, requestId };
    child = spawn(process.execPath, [scriptPath, "--window", JSON.stringify(config)], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    child.unref();
  }

  const ack = await waitForAck({ requestId, child });
  const action = existingPid !== null ? "差し替え" : "新規";
  if (ack === null) {
    // 受け取られなかった差し替え要求を残すと、後で古い画像一覧に置き換わってしまう
    if (request.target !== null) rmSync(requestPath(request.target), { force: true });
    console.error(`表示を確認できませんでした (target=${label}, ${action})` + (logPath ? `\nlog: ${logPath}` : ""));
    return 2;
  }
  console.log(`opened target=${label} pid=${ack.pid} ${action} images=${absolutePaths.length}`);
  if (ack.failedPaths.length > 0) {
    console.error("読み込めなかった画像:\n" + ack.failedPaths.join("\n"));
    return 3;
  }
  return 0;
}

async function waitForAck(params: { requestId: string; child: ReturnType<typeof spawn> | null }): Promise<Ack | null> {
  const path = ackPath(params.requestId);
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      const ack = JSON.parse(readFileSync(path, "utf8")) as Ack;
      rmSync(path);
      return ack;
    }
    if (params.child !== null && params.child.exitCode !== null) return null;
    await Bun.sleep(ACK_POLL_MS);
  }
  return null;
}

function runWindow(config: WindowConfig) {
  if (config.target !== null) {
    writeFileSync(pidPath(config.target), String(process.pid));
    // 前の窓宛てに書かれたまま受け取られなかった要求を消す
    rmSync(requestPath(config.target), { force: true });
  }

  const webview = new Webview();
  webview.title = config.target ?? "moodboard";
  webview.size = { width: 1280, height: 900, hint: SizeHint.NONE };

  // run() 中は Bun のイベントループが止まるため、callback は同期 I/O だけで書く
  webview.bind("__moodboardReady", (requestId: string, failedPaths: string[]) => {
    writeFileSync(ackPath(requestId), JSON.stringify({ pid: process.pid, failedPaths } satisfies Ack));
  });
  webview.bind("__moodboardPoll", () => {
    if (config.target === null) return null;
    const path = requestPath(config.target);
    if (!existsSync(path)) return null;
    const request = JSON.parse(readFileSync(path, "utf8")) as { url: string; pid: number };
    rmSync(path);
    return request.pid === process.pid ? request.url : null;
  });

  webview.navigate(config.url);
  webview.run(); // ウィンドウを閉じると返る

  if (config.target !== null && readPid(config.target) === process.pid) rmSync(pidPath(config.target));
}

function closeTarget(target: string): number {
  const pid = findWindowPid(target);
  if (pid === null) {
    console.error(`target=${target} のウィンドウは開いていません`);
    return 1;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    // 確認から kill までの間に窓が閉じられた場合。閉じている状態は同じなので成功として扱う
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
  rmSync(pidPath(target), { force: true });
  console.log(`closed target=${target} pid=${pid}`);
  return 0;
}

function listTargets() {
  for (const file of readdirSync(TARGETS_DIR)) {
    if (!file.endsWith(".pid")) continue;
    const target = file.slice(0, -".pid".length);
    const pid = findWindowPid(target);
    if (pid !== null) console.log(`${target}\tpid=${pid}`);
  }
}

// pid ファイルが指すプロセスが今も moodboard のウィンドウかを確かめる。古い pid ファイルは消す
function findWindowPid(target: string): number | null {
  const pid = readPid(target);
  if (pid === null) return null;
  const ps = spawnSync("ps", ["-p", String(pid), "-o", "args="], { encoding: "utf8" });
  const args = ps.stdout.trim();
  // pid が別の名前の窓に再利用されていることがあるので、引数の target まで照合する
  const isThisTarget = args.includes(scriptPath) && args.includes("--window") && args.includes(`"target":"${target}"`);
  if (ps.status === 0 && isThisTarget) return pid;
  rmSync(pidPath(target), { force: true });
  return null;
}

// mkdir の原子性でロックを取る。持ち主が kill されて残ったロックは、待ち時間を超えていれば奪う
async function acquireTargetLock(target: string): Promise<boolean> {
  const path = lockPath(target);
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      mkdirSync(path);
      return true;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      if (Date.now() - statSync(path).mtimeMs > LOCK_WAIT_MS) rmSync(path, { recursive: true, force: true });
      await Bun.sleep(ACK_POLL_MS);
    }
  }
  return false;
}

function readPid(target: string): number | null {
  const path = pidPath(target);
  if (!existsSync(path)) return null;
  const pid = Number(readFileSync(path, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function buildUrl(params: { absolutePaths: string[]; requestId: string }): string {
  return (
    "file://" +
    htmlPath.split("/").map(encodeURIComponent).join("/") +
    "?rid=" +
    params.requestId +
    "&f=" +
    params.absolutePaths.map(encodeURIComponent).join("&f=")
  );
}

function requireTargetName(name: string | undefined): string {
  if (name === undefined || !TARGET_NAME_PATTERN.test(name)) {
    usageError("名前は英数字と . _ - だけで指定してください");
  }
  return name;
}

function usageError(message: string): never {
  console.error(
    `${message}\nusage: moodboard [--target <名前>] <画像パス...>\n       moodboard --close <名前>\n       moodboard --list`,
  );
  process.exit(1);
}

function pidPath(target: string) {
  return join(TARGETS_DIR, `${target}.pid`);
}

function requestPath(target: string) {
  return join(TARGETS_DIR, `${target}.request.json`);
}

function lockPath(target: string) {
  return join(TARGETS_DIR, `${target}.lock`);
}

function ackPath(requestId: string) {
  return join(ACKS_DIR, `${requestId}.json`);
}
