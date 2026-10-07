/* ============================================================
   传输层类型与归一化
   依据 API-CONTRACT.md。后端契约的 kind 与设计文档 §15 的 kind 不同名，
   归一化只在这一层发生 —— 组件永远只见 UI 模型。
   ============================================================ */
import type {
  ContentBlock, Message, MessageKind, SenderRef,
} from '../types/model';

/* ---------- wire: WebSocket ---------- */
export type WireKind = 'text' | 'tool_call' | 'file' | 'summary' | 'system';

export type WireMember = {
  id: string;
  name: string;
  avatar: string;
  role: 'owner' | 'admin' | 'member';
  kind: 'user' | 'agent';
  engine?: string;
  systemPrompt?: string;
  online: boolean;
};

export type WireSession = {
  id: string;
  kind: 'group' | 'dm';
  name: string;
  members: WireMember[];
  workspace?: string;
};

export type WireMessage = {
  id: string;
  sessionId: string;
  kind: WireKind;
  from: string;
  ts: number;
  payload:
    | { text: string; mentions: string[] }
    | { tool: string; args: string; result?: string; open?: boolean }
    | { name: string; url: string; size: number }
    | { period: string; decisions: string[]; progress: string[]; blockers: string[] }
    | { html: string };
};

export type WireEngine = {
  id: string;
  name: string;
  avatar: string;
  version: string;
  status: 'installed' | 'not_installed';
};

export type WireEvent =
  | { type: 'hello'; session: string; recent: WireMessage[] }
  | { type: 'message'; message: WireMessage }
  | { type: 'delta'; id: string; delta: string };

/* ---------- kind 映射 ----------
   契约的 text 要按发送者身份分裂成 human / agent（文档 §08 只有这两类计入发言阈值） */
export function normalizeKind(wire: WireKind, sender: SenderRef): MessageKind {
  switch (wire) {
    case 'text': return sender.kind === 'user' ? 'human' : 'agent';
    case 'tool_call': return 'tool_event';
    case 'file': return 'file_event';
    case 'summary': return 'summary';
    case 'system': return 'system';
  }
}

/** 契约 system.payload.html 允许内联标签；这里降级为纯文本块，
 *  富文本渲染交由 MessageItem 走净化路径（文档 §16 内容安全） */
export function normalizeContent(wire: WireMessage): ContentBlock[] {
  const p = wire.payload as Record<string, unknown>;
  switch (wire.kind) {
    case 'text':
      return [{ type: 'text', text: String(p.text ?? '') }];
    case 'tool_call':
      return [];
    case 'file':
      return [{
        type: 'file',
        name: String(p.name ?? 'file'),
        size: Number(p.size ?? 0),
        url: p.url ? String(p.url) : undefined,
      }];
    case 'summary':
    case 'system':
      return [{ type: 'text', text: String(p.html ?? p.period ?? '') }];
    default:
      return [];
  }
}

export function normalizeMessage(
  wire: WireMessage,
  resolveSender: (memberId: string) => SenderRef,
): Message {
  const sender = resolveSender(wire.from);
  const kind = normalizeKind(wire.kind, sender);
  const p = wire.payload as Record<string, unknown>;
  const msg: Message = {
    id: wire.id,
    conversationId: wire.sessionId,
    sender,
    kind,
    content: normalizeContent(wire),
    mentions: Array.isArray(p.mentions) ? (p.mentions as string[]) : [],
    createdAt: wire.ts,
  };
  if (wire.kind === 'tool_call') {
    msg.toolEvent = {
      tool: String(p.tool ?? 'tool'),
      action: String(p.args ?? ''),
      resultSummary: p.result ? String(p.result) : undefined,
      approval: 'not_required',
    };
  }
  if (wire.kind === 'summary') {
    msg.summary = {
      index: 0,
      period: String(p.period ?? ''),
      decisions: (p.decisions as string[]) ?? [],
      progress: (p.progress as string[]) ?? [],
      blockers: (p.blockers as string[]) ?? [],
    };
  }
  if (wire.kind === 'file') {
    msg.fileEvent = {
      op: 'created',
      name: String(p.name ?? 'file'),
      path: String(p.url ?? ''),
      initiatorName: sender.name,
      size: Number(p.size ?? 0),
    };
  }
  return msg;
}

/** 统一错误格式（契约 §3）：{ ok:false, error } */
export type WireError = { ok: false; error: string };
export type WireOk<T> = { ok: true } & T;

export function isWireError(v: unknown): v is WireError {
  return typeof v === 'object' && v !== null && (v as WireError).ok === false;
}
