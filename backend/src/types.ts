/**
 * OQQQ core domain types.
 * Mirrors the data model in docs/OQQQ-前端设计文档.pdf.
 */

export type Role = "owner" | "admin" | "member";
export type SessionKind = "group" | "dm";
export type MessageKind = "text" | "system" | "tool_call" | "summary";

export interface Member {
  id: string;          // user id or agent id
  name: string;
  avatar: string;      // emoji or url
  role: Role;
  kind: "user" | "agent";
  /** engine behind an agent member, e.g. "hermes" | "claude-code" | "codex" | "dsh" */
  engine?: string;
  online: boolean;
}

export interface Session {
  id: string;
  kind: SessionKind;
  name: string;
  members: Member[];
  /** per-session independent workspace path */
  workspace: string;
  announcement: string;
  createdAt: number;
}

export interface TextPayload { text: string; mentions: string[] }
export interface ToolCallPayload { tool: string; args: string; result?: string; open?: boolean }
export interface SystemPayload { html: string }
export interface SummaryPayload { period: string; decisions: string[]; progress: string[]; blockers: string[] }

export interface Message {
  id: string;
  sessionId: string;
  kind: MessageKind;
  from: string;        // member id, "system" for system messages
  ts: number;
  payload: TextPayload | ToolCallPayload | SystemPayload | SummaryPayload;
}

/** Engine install status, backs 联系人 -> 添加 agent */
export type EngineStatus = "installed" | "not_installed";
export interface Engine {
  id: string;          // "hermes" | "claude-code" | "codex" | "dsh" | ...
  name: string;
  avatar: string;
  version: string;
  status: EngineStatus;
  hasUpdate?: boolean;
}

export interface Skill { id: string; name: string; desc: string; installed: boolean }
export interface Connector { id: string; name: string; desc: string; connected: boolean }
export interface PluginItem { id: string; name: string; desc: string; stars: number; downloads: string; installed: boolean }
