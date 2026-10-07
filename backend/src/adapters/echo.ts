import type { Message } from "../types.js";
import type { AgentAdapter, ChatChunk } from "./types.js";

/**
 * Test double: echoes the last user message. Lets the frontend and
 * the bus/router/session stack run end-to-end with no API key.
 */
export class EchoAdapter implements AgentAdapter {
  readonly info = { engine: "echo", version: "0.1.0", models: ["echo-1"] };

  async checkInstalled(): Promise<boolean> { return true; }

  async *chat(history: Message[], _workspace: string): AsyncGenerator<ChatChunk> {
    const last = [...history].reverse().find((m) => m.kind === "text");
    const text = last && "text" in last.payload ? last.payload.text : "(empty)";
    const reply = `echo: ${text}`;
    for (let i = 0; i < reply.length; i += 8) {
      yield { delta: reply.slice(i, i + 8), done: false };
    }
    yield { delta: "", done: true };
  }

  async install(): Promise<void> {}
  async update(): Promise<void> {}
  async uninstall(): Promise<void> {}
}
