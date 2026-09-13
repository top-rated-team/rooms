/**
 * Headless Chrome, CDP Page.startScreencast, ffmpeg.
 *
 * Node holds the clock. Headless Chrome throttles page timers, so this module
 * calls show() at each beat from SCENES, writes every screencast frame, then
 * resamples to 30 fps so a slow machine does not stretch 45 seconds into
 * something Upwork will refuse.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";

import { WebSocket } from "ws";

import { DURATION_MS, SCENES } from "./copy";
import { showExpression } from "./timeline";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

interface CdpFrame {
  data: string;
  metadata?: { timestamp?: number };
  sessionId: number;
}

interface Frame {
  t: number;
  jpeg: Buffer;
}

class Cdp {
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly handlers = new Map<string, (params: never) => void>();

  constructor(private readonly ws: WebSocket) {
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw)) as {
        id?: number;
        method?: string;
        params?: unknown;
        result?: unknown;
        error?: { message?: string };
      };
      if (msg.id != null && this.pending.has(msg.id)) {
        const box = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) box.reject(new Error(msg.error.message ?? "CDP error"));
        else box.resolve(msg.result);
        return;
      }
      if (msg.method) {
        const handler = this.handlers.get(msg.method);
        if (handler) handler(msg.params as never);
      }
    });
  }

  on<T>(method: string, fn: (params: T) => void): void {
    this.handlers.set(method, fn as (params: never) => void);
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close(): void {
    this.ws.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("no port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      await sleep(150);
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : String(last)}`);
}

function resample(frames: Frame[], durationMs: number): Buffer[] {
  if (frames.length === 0) throw new Error("Chrome sent no screencast frames");
  const t0 = frames[0].t;
  const total = Math.round((durationMs / 1000) * FPS);
  const out: Buffer[] = [];
  let cursor = 0;
  for (let i = 0; i < total; i++) {
    const t = t0 + i / FPS;
    while (cursor + 1 < frames.length && Math.abs(frames[cursor + 1].t - t) <= Math.abs(frames[cursor].t - t)) {
      cursor += 1;
    }
    out.push(frames[cursor].jpeg);
  }
  return out;
}

function encode(jpegs: Buffer[], dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-framerate",
        String(FPS),
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-crf",
        "20",
        "-r",
        String(FPS),
        dest,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let err = "";
    ffmpeg.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${err.slice(-800)}`));
    });
    const stdin = ffmpeg.stdin;
    if (!stdin) {
      reject(new Error("ffmpeg stdin missing"));
      return;
    }
    let i = 0;
    const writeNext = (): void => {
      while (i < jpegs.length) {
        const ok = stdin.write(jpegs[i]);
        i += 1;
        if (!ok) {
          stdin.once("drain", writeNext);
          return;
        }
      }
      stdin.end();
    };
    writeNext();
  });
}

export interface RenderedVideo {
  path: string;
  width: number;
  height: number;
  durationSec: number;
  bytes: number;
}

function probe(file: string): { durationSec: number; width: number; height: number } {
  const raw = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  const json = JSON.parse(raw) as {
    streams?: { width?: number; height?: number }[];
    format?: { duration?: string };
  };
  return {
    width: json.streams?.[0]?.width ?? WIDTH,
    height: json.streams?.[0]?.height ?? HEIGHT,
    durationSec: Number(json.format?.duration ?? 0),
  };
}

function serveHtml(dir: string): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const file = path.join(dir, req.url === "/" ? "timeline.html" : path.basename(req.url ?? ""));
      if (!file.startsWith(dir) || !fs.existsSync(file)) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      fs.createReadStream(file).pipe(res);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}/timeline.html`,
        close: () => server.close(),
      });
    });
  });
}

export async function renderHtmlToMp4(html: string, dest: string, durationMs = DURATION_MS): Promise<RenderedVideo> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "promo-"));
  fs.writeFileSync(path.join(dir, "timeline.html"), html);

  const debugPort = await freePort();
  const profile = path.join(dir, "chrome-profile");
  const httpServer = await serveHtml(dir);
  let chrome: ChildProcess | undefined;

  try {
    chrome = spawn(
      CHROME,
      [
        "--headless=new",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--enable-unsafe-swiftshader",
        "--force-device-scale-factor=1",
        `--window-size=${WIDTH},${HEIGHT}`,
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profile}`,
        httpServer.url,
      ],
      { stdio: "ignore" },
    );

    const target = await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (!res.ok) throw new Error(`chrome json ${res.status}`);
      const list = (await res.json()) as { type: string; webSocketDebuggerUrl?: string }[];
      const found = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (!found?.webSocketDebuggerUrl) throw new Error("no page target");
      return found.webSocketDebuggerUrl;
    }, 15_000, "Chrome debugger");

    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(target);
      socket.once("open", () => resolve(socket));
      socket.once("error", reject);
    });

    const cdp = new Cdp(ws);
    const frames: Frame[] = [];
    let captureStarted = 0;
    cdp.on<CdpFrame>("Page.screencastFrame", (params) => {
      const t = captureStarted === 0 ? 0 : (Date.now() - captureStarted) / 1000;
      frames.push({
        t,
        jpeg: Buffer.from(params.data, "base64"),
      });
      void cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
    });

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.bringToFront");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await waitFor(async () => {
      const result = (await cdp.send("Runtime.evaluate", {
        expression: "window.__PROMO && window.__PROMO.ready === true",
        returnByValue: true,
      })) as { result?: { value?: boolean } };
      if (result.result?.value !== true) throw new Error("timeline not ready");
      return true;
    }, 8_000, "promo ready");

    await cdp.send("Runtime.evaluate", { expression: "window.__PROMO.pulse()" });
    const first = SCENES[0];
    if (!first) throw new Error("SCENES is empty");
    await cdp.send("Runtime.evaluate", { expression: showExpression(first.id, first.theme) });
    await sleep(400);

    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 85,
      maxWidth: WIDTH,
      maxHeight: HEIGHT,
      everyNthFrame: 1,
    });
    captureStarted = Date.now();

    const t0 = Date.now();
    for (const scene of SCENES.slice(1)) {
      const wait = scene.at * 1000 - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      await cdp.send("Runtime.evaluate", { expression: showExpression(scene.id, scene.theme) });
    }
    const remaining = durationMs - (Date.now() - t0);
    if (remaining > 0) await sleep(remaining + 200);
    await cdp.send("Page.stopScreencast");
    await sleep(300);
    cdp.close();

    if (frames.length === 0) {
      throw new Error("Chrome sent no Page.screencastFrame events");
    }
    console.log(`  ${frames.length} screencast frames`);
    const jpegs = resample(frames, durationMs);
    await encode(jpegs, dest);
    const info = probe(dest);
    return { path: dest, bytes: fs.statSync(dest).size, ...info };
  } finally {
    httpServer.close();
    if (chrome?.pid) {
      try {
        process.kill(chrome.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2000);
        chrome?.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Chrome sometimes still holds the profile. The MP4 is already written. */
    }
  }
}

export { FPS, HEIGHT, WIDTH };
