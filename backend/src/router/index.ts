import type { Member } from "../types.js";

export interface RouteResult {
  /** member ids explicitly @-mentioned */
  mentions: string[];
  /** true when the message addresses the whole group (no @ or @all) */
  broadcast: boolean;
}

const MENTION_RE = /@([^\s@]{1,32})/g;

/**
 * Parses @mentions and resolves them to member ids by name.
 * Unknown names are kept as-is so the PM can report "no such member".
 */
export function route(text: string, members: Member[]): RouteResult {
  MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  const raw: string[] = [];
  while ((match = MENTION_RE.exec(text)) !== null) raw.push(match[1]);

  const byName = new Map(members.map((m) => [m.name, m.id]));
  const mentions = raw
    .map((n) => byName.get(n) ?? n)
    .filter((v, i, a) => a.indexOf(v) === i);
  return { mentions, broadcast: mentions.length === 0 };
}
