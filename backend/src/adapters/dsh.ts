import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import type { Message } from "../types.js";
import type { AgentAdapter, ChatChunk } from "./types.js";

const DSH_DIR = process.env.DSH_DIR ?? "/home/hatch/workspace/dsh";
const SDK_CLIENT = join(DSH_DIR, "packages/sdk/client/lib/index.js");

function lastText(history: Message[]): string {
  const last = [...history].reverse().find((m) => m.kind === "text");
  return last && "text" in last.payload ? last.payload.text : "";
}

/**
 * DeepSeek Harness adapter via the official TS SDK client (stdio JSON-RPC).
 * One persistent `dsh --profile sdk` subprocess serves all sessions;
 * dsh-side sessions are namespaced per OQQQ session id.
 * Streaming is message-level (assistant/message events), not token-level.
 */
export class DshAdapter implements AgentAdapter {
  readonly info = { engine: "dsh", version: "0.2.1-alpha.1", models: ["deepseek-chat"] };
  private harness: any = null;
  private starting: Promise<void> | null = null;

  async checkInstalled(): Promise<boolean> {
    return existsSync(SDK_CLIENT);
  }

  private async ensureStarted(workspace: string): Promise<void> {
    if (this.harness) return;
    if (!this.starting) {
      this.starting = (async () => {
        const mod = await import(pathToFileURL(SDK_CLIENT).href);
        this.harness = new mod.DeepSeekHarness({
          profile: "sdk",
          cwd: workspace,
          provider: "deepseek-official",
          model: process.env.DSH_MODEL ?? "deepseek-chat",
          initializeTimeoutMs: 60_000,
          requestTimeoutMs: 600_000,
        });
        await this.harness.start();
      })();
    }
    await this.starting;
  }

  async *chat(history: Message[], workspace: string): AsyncGenerator<ChatChunk> {
    await this.ensureStarted(workspace);
    const oqqqSession = history[0]?.sessionId ?? "default";
    const session = this.harness.session(`oqqq-${oqqqSession}`);
    const prompt = lastText(history);

    // collect assistant text via notifications; yield each message as it lands
    const pending: string[] = [];
    let resolveNext: (() => void) | null = null;
    const wake = () => { const r = resolveNext; resolveNext = null; r?.(); };

    const runPromise = session.run(prompt, {
      onNotification: (n: any) => {
        if (n?.method === "session.event") {
          const ev = n?.params?.event;
          if (ev?.type === "assistant/message") {
            const text = (ev.data?.message?.content ?? [])
              .filter((b: any) => b?.type === "text")
              .map((b: any) => b.text)
              .join("");
            if (text) { pending.push(text); wake(); }
          }
        }
      },
    });

    let done = false;
    runPromise.then(() => { done = true; wake(); }, () => { done = true; wake(); });

    let emitted = "";
    while (!done || pending.length > 0) {
      while (pending.length > 0) {
        const text = pending.shift()!;
        // yield only the unseen suffix (events may repeat the full message)
        if (text.startsWith(emitted)) {
          const delta = text.slice(emitted.length);
          if (delta) yield { delta, done: false };
          emitted = text;
        } else if (text !== emitted) {
          yield { delta: text, done: false };
          emitted = text;
        }
      }
      if (!done) await new Promise<void>((r) => { resolveNext = r; });
    }
    await runPromise.catch(() => {});
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

  /** shut down the persistent SDK subprocess */
  async dispose(): Promise<void> {
    await this.harness?.close().catch(() => {});
    this.harness = null;
    this.starting = null;
  }
}
