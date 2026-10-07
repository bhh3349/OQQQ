import type { Message, SummaryPayload } from "../types.js";
import { MessageBus } from "../bus/index.js";

/**
 * Context compression: every N *effective* messages, emit a collapsible
 * summary message into the session. Effective = text messages only;
 * tool calls, raw logs and idle chatter are excluded by the caller.
 *
 * The summary itself is produced by an LLM (PM agent) — this module
 * owns the trigger bookkeeping and the summary message shape.
 */
export class SummaryManager {
  private counters = new Map<string, number>();
  constructor(private bus: MessageBus, private threshold = 30) {}

  setThreshold(n: number) { this.threshold = n; }

  /** call for every effective message; returns true when a summary is due */
  count(sessionId: string): boolean {
    const n = (this.counters.get(sessionId) ?? 0) + 1;
    this.counters.set(sessionId, n);
    return n >= this.threshold;
  }

  reset(sessionId: string) { this.counters.set(sessionId, 0); }

  /** effective messages since last summary (text only, newest-first cap) */
  window(sessionId: string, limit = 60): Message[] {
    return this.bus.recent(sessionId, limit).filter((m) => m.kind === "text");
  }

  publishSummary(sessionId: string, payload: SummaryPayload): Message {
    const msg: Message = {
      id: `summary-${Date.now()}`, sessionId, kind: "summary",
      from: "system", ts: Date.now(), payload,
    };
    this.bus.publish(msg);
    this.reset(sessionId);
    return msg;
  }
}
