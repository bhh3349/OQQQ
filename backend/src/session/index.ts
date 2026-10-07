import { randomUUID } from "node:crypto";
import type { Member, Role, Session, SessionKind } from "../types.js";

interface CreateSessionOpts {
  kind: SessionKind;
  name: string;
  workspace: string;
  owner: Member;
  announcement?: string;
}

/**
 * Owns groups and DMs: membership, roles (owner/admin/member),
 * per-session workspace paths. The creator is owner; the PM agent
 * is granted admin when a project group is created.
 */
export class SessionManager {
  private sessions = new Map<string, Session>();

  create(opts: CreateSessionOpts): Session {
    const s: Session = {
      id: randomUUID(),
      kind: opts.kind,
      name: opts.name,
      members: [{ ...opts.owner, role: "owner" as Role }],
      workspace: opts.workspace,
      announcement: opts.announcement ?? "",
      createdAt: Date.now(),
    };
    this.sessions.set(s.id, s);
    return s;
  }

  get(id: string): Session | undefined { return this.sessions.get(id); }
  list(): Session[] { return [...this.sessions.values()]; }

  addMember(sessionId: string, m: Member, role: Role = "member"): boolean {
    const s = this.sessions.get(sessionId);
    if (!s || s.members.some((x) => x.id === m.id)) return false;
    s.members.push({ ...m, role });
    return true;
  }

  removeMember(sessionId: string, memberId: string): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    const i = s.members.findIndex((m) => m.id === memberId);
    if (i < 0 || s.members[i].role === "owner") return false; // owner can't be removed
    s.members.splice(i, 1);
    return true;
  }

  setRole(sessionId: string, memberId: string, role: Role): boolean {
    const s = this.sessions.get(sessionId);
    const m = s?.members.find((x) => x.id === memberId);
    if (!m) return false;
    m.role = role;
    return true;
  }

  setWorkspace(sessionId: string, workspace: string): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.workspace = workspace;
    return true;
  }

  setAnnouncement(sessionId: string, announcement: string): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.announcement = announcement;
    return true;
  }
}
