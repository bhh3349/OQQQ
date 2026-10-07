import { randomUUID } from "node:crypto";
import { OpenAIAdapter } from "../adapters/openai.js";
import type { AgentAdapter } from "../adapters/types.js";
import type { Member, Message, Session } from "../types.js";
import { SessionManager } from "../session/index.js";

export interface AgentSpec {
  name: string;
  avatar: string;
  role: string;          // 职责描述
  systemPrompt: string;
  engine: string;        // hermes | claude-code | codex | dsh
  model?: string;
  skills: string[];
  connectors: string[];
}

export type PmPhase = "interview" | "spec_ready" | "team_formed" | "working" | "done";

/**
 * PM Agent: owns the requirement interview, then dynamically forms
 * the team. The user confirms the spec before any agent is created.
 *
 * The actual LLM calls go through an AgentAdapter (PM is just another
 * agent with a PM system prompt); this class owns the workflow state.
 */
export class PmAgent {
  phase: PmPhase = "interview";
  private spec: AgentSpec[] = [];

  constructor(
    private sessions: SessionManager,
    private adapters: Map<string, AgentAdapter>,
    readonly member: Member,
  ) {}

  /** user-confirmed spec → create agents, add to session as members */
  formTeam(session: Session, spec: AgentSpec[]): Member[] {
    if (this.phase !== "spec_ready") throw new Error("spec not confirmed yet");
    const created: Member[] = [];
    for (const s of spec) {
      if (!this.adapters.has(s.engine)) throw new Error(`no adapter for engine ${s.engine}`);
      const m: Member = {
        id: randomUUID(), name: s.name, avatar: s.avatar,
        role: "member", kind: "agent", engine: s.engine, online: true,
      };
      this.sessions.addMember(session.id, m);
      created.push(m);
    }
    this.spec = spec;
    this.phase = "team_formed";
    return created;
  }

  confirmSpec() { this.phase = "spec_ready"; }
  getSpec(): AgentSpec[] { return this.spec; }

  /**
   * Ask the LLM to propose a team spec (JSON) from the interview history.
   * Called after the user confirms the requirement doc.
   */
  async proposeTeam(history: Message[], workspace: string): Promise<AgentSpec[]> {
    const adapter = [...this.adapters.values()].find((a) => a instanceof OpenAIAdapter);
    if (!adapter || !(adapter instanceof OpenAIAdapter)) {
      throw new Error("proposeTeam needs an OpenAI-compatible adapter");
    }
    const prompt = [
      "根据以上需求访谈记录，输出组建开发团队所需的 Agent 规格清单。",
      "只输出 JSON 数组，不要其他文字。每个元素字段：",
      '{"name":"名字","avatar":"emoji","role":"职责一句话","systemPrompt":"完整 system prompt","engine":"openai","skills":[],"connectors":[]}',
      "engine 固定填 openai。Agent 数量 2-5 个，覆盖需求所需角色（如前端、后端、测试）。",
    ].join("\n");
    const hist: Message[] = [...history, {
      id: randomUUID(), sessionId: "", kind: "text" as const,
      from: "bo", ts: Date.now(), payload: { text: prompt, mentions: [] },
    }];
    let raw = "";
    for await (const c of adapter.chat(hist, workspace, { systemPrompt: "You output only JSON." })) {
      raw += c.delta;
    }
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end < 0) throw new Error("LLM did not return a JSON array");
    const spec = JSON.parse(raw.slice(start, end + 1)) as AgentSpec[];
    this.spec = spec;
    return spec;
  }

  /** default interview system prompt; refined per project */
  static interviewPrompt(): string {
    return [
      "你是 OQQQ 项目群的 PM。你的工作分两步：",
      "1. 与用户多轮访谈，把需求聊透，输出结构化需求文档（含功能清单、验收标准、技术约束）。",
      "2. 等用户明确确认需求文档后，根据需求分析需要哪些 Agent（名字、职责、技能），输出 Agent 规格清单。",
      "在用户确认前，不要创建任何 Agent，不要写代码。提问要具体，一次问 1-2 个关键问题。",
    ].join("\n");
  }
}
