import { execFile } from "node:child_process";
import type { Message } from "../types.js";
import type { AgentAdapter, ChatChunk } from "./types.js";

function lastText(history: Message[]): string {
  const last = [...history].reverse().find((m) => m.kind === "text");
  return last && "text" in last.payload ? last.payload.text : "";
}

/**
 * NousResearch Hermes agent, headless one-shot mode:
 *   hermes chat -q "<prompt>" --yolo -Q --toolsets "file,terminal,web,skills"
 * --yolo is intentional: autonomous mode (Bo's requirement — agents finish
 * development themselves, no approval gates).
 */
export class HermesAdapter implements AgentAdapter {
  readonly info = { engine: "hermes", version: "unknown", models: [] as string[] };
  constructor(private model?: string, private toolsets = "file,terminal,web,skills") {}

  async checkInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const p = execFile("hermes", ["--version"], { timeout: 15_000 });
      let out = "";
      p.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
      p.on("error", () => resolve(false));
      p.on("close", (code) => {
        if (code === 0) this.info.version = out.trim().split("\n")[0] ?? "unknown";
        resolve(code === 0);
      });
    });
  }

  async *chat(history: Message[], workspace: string): AsyncGenerator<ChatChunk> {
    const args = ["chat", "-q", lastText(history), "--yolo", "-Q", "--toolsets", this.toolsets];
    if (this.model) args.push("--model", this.model);
    const out: string = await new Promise((resolve) => {
      let buf = "";
      const p = execFile("hermes", args, { cwd: workspace, timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
      p.stdout?.on("data", (d: Buffer) => { buf += d.toString(); });
      p.stderr?.on("data", (d: Buffer) => { buf += d.toString(); });
      p.on("error", () => resolve(buf));
      p.on("close", () => resolve(buf));
    });
    if (out) yield { delta: out, done: false };
    yield { delta: "", done: true };
  }

  async install(): Promise<void> { throw new Error("install hermes via the official installer: https://hermes-agent.nousresearch.com"); }
  async update(): Promise<void> {
    await new Promise<void>((resolve) => {
      const p = execFile("hermes", ["upgrade"], { timeout: 300_000 });
      p.on("error", () => resolve()); p.on("close", () => resolve());
    });
  }
  async uninstall(): Promise<void> { throw new Error("uninstall hermes via the official uninstaller"); }
}
