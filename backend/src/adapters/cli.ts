import { execFile } from "node:child_process";
import type { Message } from "../types.js";
import type { AgentAdapter, ChatChunk } from "./types.js";
import { getEngineDef, npmInstall, npmUninstall, npmUpdate, probeVersion } from "../engines/registry.js";

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

/**
 * Generic CLI engine adapter driven by the engine registry.
 * chatArgs: per-engine one-shot invocation (prompt appended last).
 */
export class CliAdapter implements AgentAdapter {
  readonly info = { engine: "", version: "unknown", models: [] as string[] };

  constructor(
    private engineId: string,
    private chatArgs: string[],
    models: string[] = [],
  ) {
    this.info.engine = engineId;
    this.info.models = models;
  }

  private def() {
    const d = getEngineDef(this.engineId);
    if (!d) throw new Error(`unknown engine ${this.engineId}`);
    return d;
  }

  async checkInstalled(): Promise<boolean> {
    const v = await probeVersion(this.def().command);
    if (v) { this.info.version = v; return true; }
    return false;
  }

  async *chat(history: Message[], workspace: string): AsyncGenerator<ChatChunk> {
    const r = await run(this.def().command, [...this.chatArgs, lastText(history)], workspace, 600_000);
    if (r.out) yield { delta: r.out, done: false };
    yield { delta: "", done: true };
  }

  async install(): Promise<void> { await npmInstall(this.def()); }
  async update(): Promise<void> { await npmUpdate(this.def()); }
  async uninstall(): Promise<void> { await npmUninstall(this.def()); }
}

/** Anthropic Claude Code: `claude -p --output-format text` */
export class ClaudeCodeAdapter extends CliAdapter {
  constructor() { super("claude-code", ["-p", "--output-format", "text"], ["claude"]); }
}
/** OpenAI Codex: `codex exec` */
export class CodexAdapter extends CliAdapter {
  constructor() { super("codex", ["exec", "--skip-git-repo-check"], ["gpt"]); }
}
/** OpenCode: `opencode run` */
export class OpenCodeAdapter extends CliAdapter {
  constructor() { super("opencode", ["run"], ["opencode"]); }
}
/** xAI Grok Code: `grok` one-shot */
export class GrokAdapter extends CliAdapter {
  constructor() { super("grok", [], ["grok"]); }
}
