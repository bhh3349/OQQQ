import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { MessageBus } from "./bus/index.js";
import { SessionManager } from "./session/index.js";
import { route } from "./router/index.js";
import { SummaryManager } from "./summary/index.js";
import { ArchiveManager } from "./archive/index.js";
import { PmAgent } from "./pm/index.js";
import { PluginMarket } from "./plugins/index.js";
import { EchoAdapter } from "./adapters/echo.js";
import { DshAdapter } from "./adapters/dsh.js";
import { ClaudeCodeAdapter, CodexAdapter } from "./adapters/cli.js";
import { HermesAdapter } from "./adapters/hermes.js";
import { OpenAIAdapter, toolPayload } from "./adapters/openai.js";
import type { AgentAdapter } from "./adapters/types.js";
import type { Engine, Member, Message } from "./types.js";

const bus = new MessageBus();
const sessions = new SessionManager();
const summary = new SummaryManager(bus, Number(process.env.OQQQ_SUMMARY_EVERY ?? 30));
const adapters = new Map<string, AgentAdapter>([
  ["echo", new EchoAdapter()],
  ["dsh", new DshAdapter()],
  ["claude-code", new ClaudeCodeAdapter()],
  ["codex", new CodexAdapter()],
  ["hermes", new HermesAdapter()],
]);
if (process.env.OQQQ_API_KEY) {
  adapters.set("openai", new OpenAIAdapter({
    baseURL: process.env.OQQQ_BASE_URL ?? "https://api.deepseek.com",
    apiKey: process.env.OQQQ_API_KEY,
    model: process.env.OQQQ_MODEL ?? "deepseek-chat",
  }));
}

/** seed a demo project group: owner Bo + PM (admin) */
const bo: Member = { id: "bo", name: "Bo", avatar: "🧑", role: "owner", kind: "user", online: true };
const pmEngine = process.env.OQQQ_API_KEY ? "openai" : "echo";

function makePmMember(): Member {
  return {
    id: "pm", name: "PM", avatar: "📋", role: "admin", kind: "agent",
    engine: pmEngine, online: true, systemPrompt: PmAgent.interviewPrompt(),
  };
}

/** one PmAgent per group session */
const pmAgents = new Map<string, PmAgent>();
function pmFor(sessionId: string): PmAgent | undefined {
  return pmAgents.get(sessionId);
}

const demo = sessions.create({ kind: "group", name: "OQQQ 开发群", workspace: "/tmp/oqqq-demo", owner: bo });
const demoPm = makePmMember();
sessions.addMember(demo.id, demoPm, "admin");
pmAgents.set(demo.id, new PmAgent(sessions, adapters, demoPm));
const archive = new ArchiveManager();
const market = new PluginMarket();

/** engine registry for 联系人 -> 添加 agent */
const engines: Engine[] = [
  { id: "hermes", name: "Hermes", avatar: "🟣", version: "v0.21.5", status: "installed" },
  { id: "claude-code", name: "Claude Code", avatar: "🟠", version: "v2.1.289", status: "installed" },
  { id: "codex", name: "Codex", avatar: "🔵", version: "v0.160.0", status: "not_installed" },
  { id: "dsh", name: "DeepSeek Harness", avatar: "🐋", version: "v0.2.1-alpha.1", status: "installed" },
  { id: "openai", name: "OpenAI 兼容", avatar: "⚙️", version: "v1.0.0", status: process.env.OQQQ_API_KEY ? "installed" : "not_installed" },
];

const app = Fastify({ logger: false });
await app.register(websocket);

function toClient(m: Message) {
  return JSON.stringify({ type: "message", message: m });
}

function publishText(sessionId: string, from: string, text: string, mentions: string[] = []): Message {
  const msg: Message = { id: randomUUID(), sessionId, kind: "text", from, ts: Date.now(), payload: { text, mentions } };
  bus.publish(msg);
  return msg;
}

/** WebSocket: ?session=<id> — streams session messages both ways */
app.get("/ws", { websocket: true }, (socket, req) => {
  const sessionId = (req.query as Record<string, string>).session ?? demo.id;
  socket.send(JSON.stringify({ type: "hello", session: sessionId, recent: bus.recent(sessionId) }));
  const off = bus.subscribe(sessionId, (m) => socket.send(toClient(m)));
  socket.on("message", async (raw: Buffer | string) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type !== "send") return;
      const s = sessions.get(sessionId);
      if (!s) return;
      const text: string = String(data.text ?? "").slice(0, 4000);
      const r = route(text, s.members);
      publishText(sessionId, data.from ?? "bo", text, r.mentions);
      if (summary.count(sessionId)) {
        // summary content is produced by the PM agent (LLM); placeholder shape here
        summary.publishSummary(sessionId, {
          period: `近 ${summary.every} 条`,
          decisions: [], progress: [], blockers: [],
        });
      }
      const target = s.members.find((m) => r.mentions.includes(m.id) && m.kind === "agent")
        ?? (s.kind === "group" ? s.members.find((m) => m.id === "pm") : undefined);
      if (target?.engine) {
        const adapter = adapters.get(target.engine);
        if (adapter) {
          if (adapter instanceof OpenAIAdapter) {
            adapter.onTool = (ev) => bus.publish({
              id: randomUUID(), sessionId, kind: "tool_call", from: target.id,
              ts: Date.now(), payload: toolPayload(ev),
            });
          }
          const replyId = randomUUID();
          let full = "";
          for await (const chunk of adapter.chat(bus.recent(sessionId, 20), s.workspace, { systemPrompt: target.systemPrompt })) {
            if (chunk.done) break;
            full += chunk.delta;
            socket.send(JSON.stringify({ type: "delta", id: replyId, delta: chunk.delta }));
          }
          publishText(sessionId, target.id, full);
        }
      }
    } catch { /* malformed client frames are ignored */ }
  });
  socket.on("close", off);
});

app.get("/api/sessions", async () => sessions.list());
app.get("/api/sessions/:id/messages", async (req) => {
  const { id } = req.params as Record<string, string>;
  return bus.recent(id, 100);
});
/** create a group (with PM) or dm session */
app.post("/api/sessions", async (req) => {
  const body = (req.body ?? {}) as { kind?: "group" | "dm"; name?: string; peerId?: string };
  const kind = body.kind === "dm" ? "dm" : "group";
  const s = sessions.create({
    kind,
    name: body.name ?? (kind === "dm" ? "新的聊天" : "新的项目群"),
    workspace: `/tmp/oqqq-${randomUUID().slice(0, 8)}`,
    owner: bo,
  });
  if (kind === "group") {
    const pm = makePmMember();
    sessions.addMember(s.id, pm, "admin");
    pmAgents.set(s.id, new PmAgent(sessions, adapters, pm));
  }
  return { ok: true, session: s };
});
app.get("/api/engines", async () => engines);
app.post("/api/engines/:id/install", async (req) => {
  const { id } = req.params as Record<string, string>;
  const e = engines.find((x) => x.id === id);
  const a = adapters.get(id);
  if (!e || !a) return { ok: false, error: "unknown engine" };
  try { await a.install(); e.status = "installed"; return { ok: true }; }
  catch (err) { return { ok: false, error: String(err).slice(0, 200) }; }
});
app.get("/api/skills", async () => [
  { id: "deep-research", name: "深度研究", desc: "多轮搜索 + 来源引用", installed: true },
  { id: "web-scrape", name: "网页抓取", desc: "页面正文转 Markdown", installed: true },
  { id: "pdf-parse", name: "PDF 解析", desc: "结构化文本，保留表格", installed: false },
  { id: "scheduler", name: "定时任务", desc: "cron 式定时唤醒", installed: false },
]);
app.get("/api/connectors", async () => [
  { id: "fs", name: "本地文件系统", desc: "读写本机文件，沙箱隔离", connected: true },
  { id: "github", name: "GitHub", desc: "读写仓库、提 PR", connected: true },
  { id: "gmail", name: "Gmail", desc: "搜索 / 读邮件，只读", connected: true },
  { id: "pg", name: "PostgreSQL", desc: "查询业务数据库", connected: false },
]);

/** third-party plugin marketplace (dsh-1024store) */
app.get("/api/plugins/search", async (req) => {
  const q = (req.query as Record<string, string>);
  if (!q.q) return { ok: false, error: "missing q" };
  try {
    const r = await market.search(q.q, Number(q.page ?? 1), Number(q.limit ?? 20));
    return { ok: true, ...r };
  } catch (err) { return { ok: false, error: String(err).slice(0, 300) }; }
});
app.get("/api/plugins/permissions", async (req) => {
  const q = (req.query as Record<string, string>);
  if (!q.target) return { ok: false, error: "missing target" };
  try { return { ok: true, ...(await market.permissions(q.target)) }; }
  catch (err) { return { ok: false, error: String(err).slice(0, 300) }; }
});
app.post("/api/plugins/install", async (req) => {
  const body = (req.body ?? {}) as { target?: string; confirmed?: string[] };
  if (!body.target || !Array.isArray(body.confirmed)) return { ok: false, error: "target + confirmed[] required" };
  try { return await market.install(body.target, body.confirmed); }
  catch (err) { return { ok: false, error: String(err).slice(0, 500) }; }
});
function needPm(id: string) {
  const p = pmFor(id);
  if (!p) throw new Error("no PM in this session");
  return p;
}
app.get("/api/sessions/:id/pm", async (req) => {
  const { id } = req.params as Record<string, string>;
  try { const p = needPm(id); return { phase: p.phase, spec: p.getSpec() }; }
  catch (err) { return { ok: false, error: String(err).slice(0, 200) }; }
});
app.post("/api/sessions/:id/pm/confirm", async (req) => {
  const { id } = req.params as Record<string, string>;
  try { const p = needPm(id); p.confirmSpec(); return { ok: true, phase: p.phase }; }
  catch (err) { return { ok: false, error: String(err).slice(0, 200) }; }
});
app.post("/api/sessions/:id/pm/propose-team", async (req) => {
  const { id } = req.params as Record<string, string>;
  const s = sessions.get(id);
  if (!s) return { ok: false, error: "no session" };
  try {
    const spec = await needPm(id).proposeTeam(bus.recent(id, 40), s.workspace);
    return { ok: true, spec };
  } catch (err) { return { ok: false, error: String(err).slice(0, 300) }; }
});
app.post("/api/sessions/:id/pm/form-team", async (req) => {
  const { id } = req.params as Record<string, string>;
  const s = sessions.get(id);
  if (!s) return { ok: false, error: "no session" };
  try {
    const p = needPm(id);
    const created = p.formTeam(s, p.getSpec());
    const spec = p.getSpec();
    created.forEach((m, i) => { m.systemPrompt = spec[i]?.systemPrompt; });
    return { ok: true, members: created.map((m) => m.id) };
  } catch (err) { return { ok: false, error: String(err).slice(0, 300) }; }
});
app.post("/api/sessions/:id/archive", async (req) => {
  const { id } = req.params as Record<string, string>;
  const s = sessions.get(id);
  if (!s) return { ok: false, error: "no session" };
  const recent = bus.recent(id, 200);
  const summaries = recent.filter((m) => m.kind === "summary");
  return { ok: true, archive: archive.build(s, summaries, recent.slice(-20), [], { done: [], todo: [] }) };
});

const port = Number(process.env.PORT ?? 18791);
await app.listen({ port, host: "127.0.0.1" });
console.log(`oqqq-backend listening on 127.0.0.1:${port} (demo session ${demo.id})`);
