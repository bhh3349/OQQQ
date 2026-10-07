import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { route } from "./router/index.js";
import { SessionManager } from "./session/index.js";
import { MessageBus } from "./bus/index.js";
import { SummaryManager } from "./summary/index.js";
import { ArchiveManager } from "./archive/index.js";
import type { Member, Message } from "./types.js";

const bo: Member = { id: "bo", name: "Bo", avatar: "🧑", role: "owner", kind: "user", online: true };
const pm: Member = { id: "pm", name: "PM", avatar: "📋", role: "admin", kind: "agent", engine: "echo", online: true };

function textMsg(id: string, sessionId: string, text: string): Message {
  return { id, sessionId, kind: "text", from: "bo", ts: Date.now(), payload: { text, mentions: [] } };
}

describe("router", () => {
  it("resolves @name to member id", () => {
    const r = route("@PM 你好", [bo, pm]);
    assert.deepEqual(r.mentions, ["pm"]);
    assert.equal(r.broadcast, false);
  });
  it("broadcast when no mentions", () => {
    const r = route("大家好", [bo, pm]);
    assert.deepEqual(r.mentions, []);
    assert.equal(r.broadcast, true);
  });
  it("keeps unknown names as-is", () => {
    const r = route("@Ghost 干活", [bo, pm]);
    assert.deepEqual(r.mentions, ["Ghost"]);
  });
  it("dedupes repeated mentions", () => {
    const r = route("@PM @PM 来", [bo, pm]);
    assert.deepEqual(r.mentions, ["pm"]);
  });
});

describe("session", () => {
  it("creator is owner; PM added as admin", () => {
    const sm = new SessionManager();
    const s = sm.create({ kind: "group", name: "g", workspace: "/tmp/w", owner: bo });
    assert.equal(s.members[0].role, "owner");
    assert.equal(sm.addMember(s.id, pm, "admin"), true);
    assert.equal(sm.get(s.id)!.members.find((m) => m.id === "pm")!.role, "admin");
  });
  it("owner cannot be removed", () => {
    const sm = new SessionManager();
    const s = sm.create({ kind: "group", name: "g", workspace: "/tmp/w", owner: bo });
    assert.equal(sm.removeMember(s.id, "bo"), false);
    assert.equal(sm.get(s.id)!.members.length, 1);
  });
  it("duplicate member rejected", () => {
    const sm = new SessionManager();
    const s = sm.create({ kind: "group", name: "g", workspace: "/tmp/w", owner: bo });
    assert.equal(sm.addMember(s.id, pm), true);
    assert.equal(sm.addMember(s.id, pm), false);
  });
});

describe("summary", () => {
  it("triggers every N messages", () => {
    const bus = new MessageBus();
    const sm = new SummaryManager(bus, 3);
    assert.equal(sm.count("s1"), false);
    assert.equal(sm.count("s1"), false);
    assert.equal(sm.count("s1"), true); // 3rd hits threshold
    assert.equal(sm.count("s1"), false); // counter reset
  });
  it("publishSummary emits a summary message", () => {
    const bus = new MessageBus();
    const sm = new SummaryManager(bus, 30);
    const seen: Message[] = [];
    bus.subscribe("s1", (m) => seen.push(m));
    sm.publishSummary("s1", { period: "近 30 条", decisions: ["用 Fastify"], progress: [], blockers: [] });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].kind, "summary");
  });
});

describe("archive", () => {
  it("builds a restorable project archive", () => {
    const sm = new SessionManager();
    const s = sm.create({ kind: "group", name: "g", workspace: "/tmp/w", owner: bo });
    sm.addMember(s.id, pm, "admin");
    const am = new ArchiveManager();
    const tail = [textMsg("m1", s.id, "hello")];
    const a = am.build(s, [], tail, ["a.ts"], { done: ["P0"], todo: ["P1"] });
    assert.equal(a.version, 1);
    assert.equal(a.session.id, s.id);
    assert.equal(a.members.length, 2);
    assert.deepEqual(a.tail, tail);
    assert.deepEqual(a.notes.done, ["P0"]);
  });
});

describe("bus", () => {
  it("recent returns last N in order", () => {
    const bus = new MessageBus();
    for (let i = 0; i < 5; i++) bus.publish(textMsg(`m${i}`, "s1", `t${i}`));
    const r = bus.recent("s1", 3);
    assert.deepEqual(r.map((m) => m.id), ["m2", "m3", "m4"]);
  });
  it("subscribers receive published messages", () => {
    const bus = new MessageBus();
    const got: Message[] = [];
    const off = bus.subscribe("s1", (m) => got.push(m));
    bus.publish(textMsg("m1", "s1", "hi"));
    bus.publish(textMsg("m2", "s2", "other session"));
    assert.equal(got.length, 1);
    off();
    bus.publish(textMsg("m3", "s1", "after off"));
    assert.equal(got.length, 1);
  });
});
