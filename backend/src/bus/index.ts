import type { Message } from "../types.js";

type Handler = (msg: Message) => void;

/**
 * In-memory message bus. Sessions are topics; subscribers get every
 * message published to the sessions they watch. Durable storage comes
 * later (SQLite) — the interface stays the same.
 */
export class MessageBus {
  private subs = new Map<string, Set<Handler>>();
  private history = new Map<string, Message[]>();
  private readonly cap: number;

  constructor(cap = 500) { this.cap = cap; }

  subscribe(sessionId: string, fn: Handler): () => void {
    let set = this.subs.get(sessionId);
    if (!set) { set = new Set(); this.subs.set(sessionId, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  publish(msg: Message): void {
    const h = this.history.get(msg.sessionId) ?? [];
    h.push(msg);
    if (h.length > this.cap) h.splice(0, h.length - this.cap);
    this.history.set(msg.sessionId, h);
    for (const fn of this.subs.get(msg.sessionId) ?? []) {
      try { fn(msg); } catch { /* subscriber errors never break the bus */ }
    }
  }

  /** newest-first slice, for initial load */
  recent(sessionId: string, limit = 50): Message[] {
    const h = this.history.get(sessionId) ?? [];
    return h.slice(-limit);
  }

  count(sessionId: string): number {
    return this.history.get(sessionId)?.length ?? 0;
  }
}
