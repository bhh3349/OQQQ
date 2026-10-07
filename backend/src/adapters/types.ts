import type { Message } from "../types.js";

export interface ChatChunk {
  /** streaming text delta */
  delta: string;
  done: boolean;
}

export interface AdapterInfo {
  engine: string;
  version: string;
  models: string[];
}

/**
 * Uniform interface every agent engine implements.
 * Hermes / Claude Code / Codex / dsh each get one adapter.
 * The orchestrator only ever talks to this interface.
 */
export interface AgentAdapter {
  readonly info: AdapterInfo;

  /** true when the engine binary / service is reachable */
  checkInstalled(): Promise<boolean>;

  /**
   * Send one user turn. Yields streaming deltas, then a final
   * assistant Message. History is the recent session messages
   * (summaries + last N), already trimmed by the caller.
   */
  chat(history: Message[], workspace: string): AsyncGenerator<ChatChunk>;

  /** install / update / uninstall the engine (联系人 -> 添加 agent) */
  install(): Promise<void>;
  update(): Promise<void>;
  uninstall(): Promise<void>;
}
