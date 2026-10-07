import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Message, ToolCallPayload } from "../types.js";
import type { AgentAdapter, ChatChunk, ChatOpts } from "./types.js";

export interface OpenAIOpts {
  baseURL: string;
  apiKey: string;
  model: string;
  /** max agent-loop iterations per turn */
  maxIterations?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }

/** silent denylist: catastrophically destructive patterns only. no approval UI. */
const DANGEROUS_RE = /(^|[\s;&|])(rm\s+-rf?\s+\/$|rm\s+-rf?\s+\/\*|mkfs(\.|$)|dd\s+.*of=\/dev\/|:?\(\)\s*\{\s*:\|\:&\s*\}\s*;?\s*:|shutdown|reboot|poweroff)/;

const TOOLS = [  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the workspace. Path is relative to workspace root.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write (create or overwrite) a file in the workspace. Path is relative to workspace root.",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    },
  },
  {
    type: "function",
    function: {
      name: "exec",
      description: "Run a shell command in the workspace directory. Timeout 120s.",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    },
  },
];

export interface ToolEvent { tool: string; args: string; result: string; }

/**
 * OpenAI-compatible agent adapter with tool-calling loop.
 * dsh is NOT used for the LLM call — only as plugin/tool runtime.
 * onTool callback lets the orchestrator publish tool_call messages live.
 */
export class OpenAIAdapter implements AgentAdapter {
  readonly info: AgentAdapter["info"];
  onTool?: (ev: ToolEvent) => void;

  constructor(private opts: OpenAIOpts) {
    this.info = { engine: "openai-compat", version: "1.0.0", models: [opts.model] };
  }

  async checkInstalled(): Promise<boolean> { return true; }

  /** confine a relative path inside the workspace */
  private safePath(workspace: string, p: string): string {
    const abs = resolve(workspace, p);
    if (!abs.startsWith(resolve(workspace) + "/") && abs !== resolve(workspace)) {
      throw new Error("path escapes workspace");
    }
    return abs;
  }

  private async runTool(name: string, args: Record<string, string>, workspace: string): Promise<string> {
    if (name === "read_file") {
      return await readFile(this.safePath(workspace, args.path), "utf-8").catch((e) => `error: ${e.message}`);
    }
    if (name === "write_file") {
      const abs = this.safePath(workspace, args.path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, args.content ?? "", "utf-8");
      return `wrote ${args.path} (${(args.content ?? "").length} chars)`;
    }
    if (name === "exec") {
      // autonomous mode: no approval gates (Bo's requirement).
      // only a silent denylist for catastrophically destructive commands.
      const cmd = args.command ?? "";
      if (DANGEROUS_RE.test(cmd)) return "error: command blocked by safety denylist";
      return await new Promise((resolve) => {
        execFile("bash", ["-c", cmd], { cwd: workspace, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
          (err, stdout, stderr) => resolve(((stdout ?? "") + (stderr ?? "")).slice(0, 8000) || (err ? `exit: ${err.message}` : "(no output)")));
      });
    }
    return `unknown tool: ${name}`;
  }

  private toMessages(history: Message[], systemPrompt?: string): ChatMessage[] {
    const out: ChatMessage[] = [{
      role: "system",
      content: systemPrompt ?? "You are a coding agent in the OQQQ group chat. Use the available tools to read/write files and run commands in your workspace. Be concise.",
    }];
    for (const m of history) {
      if (m.kind !== "text" || !("text" in m.payload)) continue;
      out.push({ role: m.from === "bo" || m.from === "user" ? "user" : "assistant", content: m.payload.text });
    }
    return out;
  }

  private async callApi(messages: ChatMessage[], stream: boolean): Promise<Response> {
    const url = this.opts.baseURL.replace(/\/$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.opts.apiKey}` },
      body: JSON.stringify({ model: this.opts.model, messages, tools: TOOLS, stream }),
    });
    if (!res.ok) throw new Error(`openai-compat: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res;
  }

  async *chat(history: Message[], workspace: string, opts?: ChatOpts): AsyncGenerator<ChatChunk> {
    const messages = this.toMessages(history, opts?.systemPrompt);
    const maxIter = this.opts.maxIterations ?? 10;

    for (let iter = 0; iter < maxIter; iter++) {
      const res = await this.callApi(messages, true);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "", text = "";
      const toolCalls = new Map<string, { name: string; args: string }>();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta;
            if (typeof delta?.content === "string") { text += delta.content; yield { delta: delta.content, done: false }; }
            for (const tc of delta?.tool_calls ?? []) {
              const cur = toolCalls.get(tc.id) ?? { name: "", args: "" };
              if (tc.function?.name) cur.name = tc.function.name;
              if (typeof tc.function?.arguments === "string") cur.args += tc.function.arguments;
              toolCalls.set(tc.id, cur);
            }
          } catch { /* partial JSON */ }
        }
      }

      const calls = [...toolCalls.entries()];
      if (calls.length === 0) break; // no tools → turn done

      messages.push({ role: "assistant", content: text, tool_calls: calls.map(([id, c]) => ({ id, type: "function" as const, function: { name: c.name, arguments: c.args } })) });
      for (const [id, c] of calls) {
        let args: Record<string, string> = {};
        try { args = JSON.parse(c.args || "{}"); } catch { /* keep {} */ }
        const result = await this.runTool(c.name, args, workspace);
        this.onTool?.({ tool: c.name, args: c.args, result: result.slice(0, 2000) });
        messages.push({ role: "tool", content: result.slice(0, 8000), tool_call_id: id });
      }
    }
    yield { delta: "", done: true };
  }

  async install(): Promise<void> {}
  async update(): Promise<void> {}
  async uninstall(): Promise<void> {}
}

/** tool_call message payload helper for the orchestrator */
export function toolPayload(ev: ToolEvent): ToolCallPayload {
  return { tool: ev.tool, args: ev.args.slice(0, 500), result: ev.result, open: false };
}
