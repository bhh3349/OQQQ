import type { Message } from "../types.js";
import type { AgentAdapter, ChatChunk } from "./types.js";

export interface OpenAIOpts {
  baseURL: string;   // e.g. https://api.deepseek.com, or any OpenAI-compatible gateway
  apiKey: string;
  model: string;     // e.g. deepseek-chat
}

interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

/**
 * OpenAI-compatible chat adapter (Chat Completions + SSE streaming).
 * Covers the vast majority of third-party suppliers/gateways.
 * dsh is NOT used for the LLM call here — only as plugin/tool runtime.
 */
export class OpenAIAdapter implements AgentAdapter {
  readonly info: AgentAdapter["info"];

  constructor(private opts: OpenAIOpts) {
    this.info = { engine: "openai-compat", version: "1.0.0", models: [opts.model] };
  }

  async checkInstalled(): Promise<boolean> { return true; }

  private toMessages(history: Message[]): ChatMessage[] {
    return history
      .filter((m) => m.kind === "text")
      .map((m) => {
        const text = "text" in m.payload ? m.payload.text : "";
        return { role: m.from === "bo" || m.from === "user" ? "user" as const : "assistant" as const, content: text };
      });
  }

  async *chat(history: Message[], _workspace: string): AsyncGenerator<ChatChunk> {
    const url = this.opts.baseURL.replace(/\/$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages: this.toMessages(history),
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => "");
      throw new Error(`openai-compat: HTTP ${res.status} ${err.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
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
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) yield { delta, done: false };
        } catch { /* partial JSON: ignore */ }
      }
    }
    yield { delta: "", done: true };
  }

  async install(): Promise<void> {}
  async update(): Promise<void> {}
  async uninstall(): Promise<void> {}
}
