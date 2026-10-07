/* ============================================================
   统一事件（设计文档 §16）
   流式、离线、审批、失败都是一等事件，不是异常分支。
   ============================================================ */
import type {
  AgentContact, AgentEngineDescriptor, Capability, ConnectionState,
  Conversation, Message, ProjectPhase, RunState, WorkspaceNode,
} from '../types/model';

export type OqqqEvent =
  | { type: 'connection.state_changed'; state: ConnectionState; detail?: string }
  | { type: 'conversation.created'; conversation: Conversation }
  | { type: 'conversation.updated'; conversation: Conversation }
  | { type: 'message.appended'; message: Message }
  | { type: 'message.delta'; conversationId: string; messageId: string; delta: string }
  | { type: 'run.state_changed'; conversationId: string; runId: string; messageId: string; state: RunState }
  | { type: 'tool.approval_requested'; messageId: string; tool: string; action: string; initiator: string }
  | { type: 'tool.completed'; messageId: string; resultSummary?: string }
  | { type: 'workspace.changed'; conversationId: string; node: WorkspaceNode }
  | { type: 'agent.status_changed'; contact: AgentContact }
  | { type: 'contact.group_changed' }
  | { type: 'engine.install_progress'; engineId: string; progress: number; stage: string }
  | { type: 'engine.list_changed'; engines: AgentEngineDescriptor[] }
  | { type: 'capability.catalog_loaded'; kind: Capability['kind']; items: Capability[] }
  | { type: 'capability.install_progress'; capabilityId: string; progress: number; stage: string }
  | { type: 'project.phase_changed'; conversationId: string; phase: ProjectPhase }
  | { type: 'project.archive_progress'; conversationId: string; progress: number; stage: string }
  | { type: 'project.archived'; conversationId: string; archivePath: string }
  | { type: 'toast'; tone: 'info' | 'success' | 'warning' | 'error'; text: string };

export type Listener = (e: OqqqEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: OqqqEvent): void {
    for (const fn of this.listeners) fn(e);
  }
}
