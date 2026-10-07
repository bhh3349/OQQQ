import { execFile } from "node:child_process";

/** Engine definition registry (ekko-studio pattern). */
export interface EngineDefinition {
  id: string;
  name: string;
  avatar: string;
  /** binary probed by `<command> --version` */
  command: string;
  /** npm package for real install/update/uninstall; absent = external/manual */
  packageName?: string;
  /** shown when install must be done manually */
  docsUrl?: string;
}

export const ENGINE_DEFINITIONS: EngineDefinition[] = [
  { id: "hermes", name: "Hermes", avatar: "🟣", command: "hermes", docsUrl: "https://github.com/NousResearch/Hermes" },
  { id: "claude-code", name: "Claude Code", avatar: "🟠", command: "claude", packageName: "@anthropic-ai/claude-code" },
  { id: "codex", name: "Codex", avatar: "🔵", command: "codex", packageName: "@openai/codex" },
  { id: "opencode", name: "OpenCode", avatar: "🟢", command: "opencode", packageName: "opencode-ai" },
  { id: "grok", name: "Grok Code", avatar: "⚫", command: "grok", packageName: "@xai-official/grok" },
  { id: "dsh", name: "DeepSeek Harness", avatar: "🐋", command: "dsh", docsUrl: "https://github.com/imsai-sh/deepseek-harness" },
  // openai/echo are API/built-in: no install needed
  { id: "openai", name: "OpenAI 兼容", avatar: "⚙️", command: "" },
  { id: "echo", name: "Echo（测试）", avatar: "📢", command: "" },
];

export function getEngineDef(id: string): EngineDefinition | undefined {
  return ENGINE_DEFINITIONS.find((d) => d.id === id);
}

function npm(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("npm", args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).slice(0, 500)));
      else resolve(stdout.slice(0, 2000));
    });
  });
}

/** real install: npm install -g <packageName> (10 min timeout) */
export async function npmInstall(def: EngineDefinition): Promise<void> {
  if (!def.packageName) throw Object.assign(new Error(`install ${def.name} manually: ${def.docsUrl ?? "no package"}`), { code: "MANUAL_INSTALL" });
  await npm(["install", "-g", def.packageName], 600_000);
}

/** real update = reinstall latest */
export async function npmUpdate(def: EngineDefinition): Promise<void> {
  await npmInstall(def);
}

export async function npmUninstall(def: EngineDefinition): Promise<void> {
  if (!def.packageName) throw new Error(`${def.name} is managed externally`);
  await npm(["uninstall", "-g", def.packageName], 300_000);
}

/** probe `<command> --version`; returns version string or null */
export function probeVersion(command: string): Promise<string | null> {
  if (!command) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(command, ["--version"], { timeout: 15_000 }, (err, stdout, stderr) => {
      if (err) return resolve(null);
      const m = /(\d+\.\d+\.\d+[^ \n]*)/.exec(`${stdout}${stderr}`);
      resolve(m ? m[1] : "unknown");
    });
  });
}
