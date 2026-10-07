import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Member, Message, Session } from "../types.js";

export interface ProjectArchive {
  version: 1;
  exportedAt: number;
  session: Pick<Session, "id" | "name" | "kind" | "workspace" | "announcement">;
  members: Member[];
  /** stage summaries in order (kind === "summary") */
  summaryChain: Message[];
  /** recent tail for immediate context */
  tail: Message[];
  files: string[];
  notes: { done: string[]; todo: string[] };
}

/**
 * 项目完结导出：把群聊恢复所需的一切打成一个 JSON 档案。
 * 恢复流程：新群 → 档案发给 PM → PM 重建 Agent → 拉群 → 注入总结与约束。
 */
export class ArchiveManager {
  build(session: Session, summaries: Message[], tail: Message[], files: string[],
        notes: { done: string[]; todo: string[] }): ProjectArchive {
    return {
      version: 1,
      exportedAt: Date.now(),
      session: { id: session.id, name: session.name, kind: session.kind, workspace: session.workspace, announcement: session.announcement },
      members: session.members,
      summaryChain: summaries,
      tail,
      files,
      notes,
    };
  }

  async save(archive: ProjectArchive, dir: string): Promise<string> {
    await mkdir(dir, { recursive: true });
    const path = join(dir, `oqqq-archive-${archive.session.id}.json`);
    await writeFile(path, JSON.stringify(archive, null, 2), "utf-8");
    return path;
  }
}
