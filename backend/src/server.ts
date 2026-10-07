import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { MessageBus } from "./bus/index.js";
import { SessionManager } from "./session/index.js";
import { route } from "./router/index.js";
import { EchoAdapter } from "./adapters/echo.js";
import { DshAdapter } from "./adapters/dsh.js";
import { ClaudeCodeAdapter, CodexAdapter } from "./adapters/cli.js";
import { HermesAdapter } from "./adapters/hermes.js";
import type { AgentAdapter } from "./adapters/types.js";
import type { Member, Message } from "./types.js";

const bus = new MessageBus();
const sessions = new SessionManager();
const adapters = new Map<string, AgentAdapter>([
  ["echo", new EchoAdapter()],
  ["dsh", new DshAdapter()],
  ["claude-code", new ClaudeCodeAdapter()],
  ["codex", new CodexAdapter()],
  ["hermes", new HermesAdapter()],
]);

/** seed a demo project group: owner Bo + PM (admin) */
const bo: Member = { id: "bo", name: "Bo", avatar: "🧑", role: "owner", kind: "user", online: true };
const pm: Member = { id: "pm", name: "PM", avatar: "📋", role: "admin", kind: "agent", engine: "echo", online: true };
const demo = sessions.create({ kind: "group", name: "OQQQ 开发群", workspace: "/tmp/oqqq-demo", owner: bo });
sessions.addMember(demo.id, pm, "admin");

const app = Fastify({ logger: false });
await app.register(websocket);

function toClient(m: Message) {
  return JSON.stringify({ type: "message", message: m });
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
      const msg: Message = {
        id: randomUUID(), sessionId, kind: "text", from: data.from ?? "bo",
        ts: Date.now(), payload: { text, mentions: r.mentions },
      };
      bus.publish(msg);
      // dispatch: first @-mentioned agent, else PM in groups
      const target = s.members.find((m) => r.mentions.includes(m.id) && m.kind === "agent")
        ?? (s.kind === "group" ? s.members.find((m) => m.id === "pm") : undefined);
      if (target?.engine) {
        const adapter = adapters.get(target.engine);
        if (adapter) {
          const replyId = randomUUID();
          let full = "";
          for await (const chunk of adapter.chat(bus.recent(sessionId, 20), s.workspace)) {
            if (chunk.done) break;
            full += chunk.delta;
            socket.send(JSON.stringify({ type: "delta", id: replyId, delta: chunk.delta }));
          }
          bus.publish({ id: replyId, sessionId, kind: "text", from: target.id, ts: Date.now(), payload: { text: full, mentions: [] } });
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

const port = Number(process.env.PORT ?? 18791);
await app.listen({ port, host: "127.0.0.1" });
console.log(`oqqq-backend listening on 127.0.0.1:${port} (demo session ${demo.id})`);
