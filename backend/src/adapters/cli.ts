import { execFile } from "node:child_process";
import type { Message } from "../types.js";
import type { AgentAdapter, ChatChunk } from "./types.js";

function lastText(history: Message[]): string {
  const last = [...history].reverse().find((m) => m.kind === "text");
  return last && "text" in last.payload ? last.payload.text : "";
}

async function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    let out = "";
    const p = execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
    p.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    p.stderr?.on("data", (d: Buffer) => { out += d.toString(); });
    p.on("error", () => resolve({ code: -1, out }));
    p.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
}

/** Anthropic Claude Code: `claude -p --output-format text` one-shot */
export class ClaudeCodeAdapter implements AgentAdapter {
  readonly info = { engine: "claude-code", version: "unknown", models: ["claude"] };
  async checkInstalled(): Promise<boolean> {
    const r = await run("claude", ["--version"], process.cwd(), 15_000);
    if (r.code === 0) { this.info.version = r.out.trim().split("\n")[0] ?? "unknown"; return true; }
    return false;
  }
  async *chat(history: Message[], workspace: string): AsyncGenerator<ChatChunk> {
    const r = await run("claude", ["-p", "--output-format", "text", lastText(history)], workspace, 600_000);
    if (r.out) yield { delta: r.out, done: false };
    yield { delta: "", done: true };
  }
  async install(): Promise<void> { throw new Error("install claude code via npm i -g @anthropic-ai/claude-code"); }
  async update(): Promise<void> { await run("npm", ["update", "-g", "@anthropic-ai/claude-code"], process.cwd(), 300_000); }
  async uninstall(): Promise<void> { await run("npm", ["uninstall", "-g", "@anthropic-ai/claude-code"], process.cwd(), 300_000); }
}

/** OpenAI Codex: `codex exec` one-shot */
export class CodexAdapter implements AgentAdapter {
  readonly info = { engine: "codex", version: "unknown", models: ["gpt"] };
  async checkInstalled(): Promise<boolean> {
    const r = await run("codex", ["--version"], process.cwd(), 15_000);
    if (r.code === 0) { this.info.version = r.out.trim().split("\n")[0] ?? "unknown"; return true; }
    return false;
  }
  async *chat(history: Message[], workspace: string): AsyncGenerator<ChatChunk> {
    const r = await run("codex", ["exec", "--skip-git-repo-check", lastText(history)], workspace, 600_000);
    if (r.out) yield { delta: r.out, done: false };
    yield { delta: "", done: true };
  }
  async install(): Promise<void> { throw new Error("install codex via npm i -g @openai/codex"); }
  async update(): Promise<void> { await run("npm", ["update", "-g", "@openai/codex"], process.cwd(), 300_000); }
  async uninstall(): Promise<void> { await run("npm", ["uninstall", "-g", "@openai/codex"], process.cwd(), 300_000); }
}
