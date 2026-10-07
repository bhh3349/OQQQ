import { execFile } from "node:child_process";
import type { Message } from "../types.js";
import type { AgentAdapter, ChatChunk } from "./types.js";

const DSH_BIN = process.env.DSH_BIN ?? "pnpm";
const DSH_DIR = process.env.DSH_DIR ?? "/home/hatch/workspace/dsh";

function parseEvent(line: string, onSession: (sid: string) => void): ChatChunk | null {
  if (!line) return null;
  try {
    const ev = JSON.parse(line);
    if (typeof ev.sessionId === "string" && ev.sessionId) onSession(ev.sessionId);
    if (typeof ev.text === "string" && ev.text) return { delta: ev.text, done: false };
    if (typeof ev.delta === "string" && ev.delta) return { delta: ev.delta, done: false };
  } catch { /* non-JSON diagnostics: ignore */ }
  return null;
}

/**
 * DeepSeek Harness adapter (headless CLI mode).
 * Spawns `dsh --profile headless --json` per turn, streams NDJSON events.
 * Session continuity via --session-id (managed by caller).
 */
export class DshAdapter implements AgentAdapter {
  readonly info = { engine: "dsh", version: "0.2.1-alpha.1", models: ["deepseek-chat"] };
  private sessionId?: string;

  async checkInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const p = execFile(DSH_BIN, ["dsh", "--profile", "headless", "--help"], { cwd: DSH_DIR, timeout: 60_000 });
      p.on("error", () => resolve(false));
      p.on("exit", (code) => resolve(code === 0));
    });
  }

  async *chat(history: Message[], workspace: string): AsyncGenerator<ChatChunk> {
    const last = [...history].reverse().find((m) => m.kind === "text");
    const prompt = last && "text" in last.payload ? last.payload.text : "";
    const args = ["dsh", "--profile", "headless", "--json"];
    if (this.sessionId) args.push("--session-id", this.sessionId);
    args.push(prompt);

    const child = execFile(DSH_BIN, args, {
      cwd: workspace, timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env },
    });

    let buf = "";
    let closed = false;
    child.stdout?.on("data", (d: Buffer) => { buf += d.toString(); });
    const done = new Promise<void>((resolve) => {
      child.on("close", () => { closed = true; resolve(); });
      child.on("error", () => { closed = true; resolve(); });
    });

    // incrementally parse complete NDJSON lines for live deltas
    let cursor = 0;
    while (!closed) {
      const nl = buf.indexOf("\n", cursor);
      if (nl < 0) { await new Promise((r) => setTimeout(r, 60)); continue; }
      const line = buf.slice(cursor, nl).trim();
      cursor = nl + 1;
      const chunk = parseEvent(line, (sid) => { this.sessionId = sid; });
      if (chunk) yield chunk;
    }
    // trailing partial line
    const tail = buf.slice(cursor).trim();
    const chunk = parseEvent(tail, (sid) => { this.sessionId = sid; });
    if (chunk) yield chunk;
    await done;
    yield { delta: "", done: true };
  }

  async install(): Promise<void> {
    throw new Error("dsh is managed externally; install it via the dsh repo");
  }
  async update(): Promise<void> {
    throw new Error("dsh is managed externally; update it via the dsh repo");
  }
  async uninstall(): Promise<void> {
    throw new Error("dsh is managed externally");
  }
}
