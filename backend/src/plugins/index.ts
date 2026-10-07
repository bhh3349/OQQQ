import { execFile } from "node:child_process";

const API = "https://api.deepseek1024.com";
const DSH_DIR = process.env.DSH_DIR ?? "/home/hatch/workspace/dsh";
const DSH_BIN = process.env.DSH_BIN ?? `${DSH_DIR}/apps/cli/lib/bin.js`;

export interface PluginInfo {
  id: string;
  name: string;
  owner: string;
  url: string;
  category: string | null;
  description: string;
  install: string;
  target: string;
  stars: number;
  installCount?: number;
}

/**
 * Third-party plugin marketplace (dsh-1024store).
 * - Search via the free public API (anonymous quota: 50/day).
 * - Install is REAL: runs `dsh plugin add <target>` — no fake buttons.
 * - Install requires explicit permission confirmation: the caller must pass
 *   the exact permission list shown by `permissions()` (no silent installs).
 */
export class PluginMarket {
  async search(q: string, page = 1, limit = 20): Promise<{ total: number; results: PluginInfo[] }> {
    const url = `${API}/v1/plugins/search?q=${encodeURIComponent(q)}&page=${page}&limit=${Math.min(limit, 100)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "oqqq-backend/0.1" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) throw new Error("plugin store quota exhausted (anonymous 50/day)");
    if (!res.ok) throw new Error(`plugin store: HTTP ${res.status}`);
    const data = await res.json() as { total: number; results: any[] };
    return {
      total: data.total ?? 0,
      results: (data.results ?? []).map((r) => ({
        id: r.id, name: r.name, owner: r.owner, url: r.url,
        category: r.category ?? null,
        description: r.description?.zh ?? r.description?.en ?? "",
        install: r.install ?? `dsh plugin --profile web add github:${r.id}`,
        target: r.target ?? `github:${r.id}`,
        stars: r.stars ?? 0,
        installCount: r.installCount,
      })),
    };
  }

  /**
   * Fetch the plugin's declared permissions from its GitHub repo
   * (package.json `dsh.permissions` or manifest). The frontend MUST show
   * these and get explicit user confirmation before install().
   *
   * Uses the GitHub contents API (raw.githubusercontent.com hangs behind
   * this network's proxy for Node fetch).
   */
  async permissions(target: string): Promise<{ target: string; permissions: string[]; repo: string }> {
    const m = /^github:([^#]+)(?:#path:(.+))?$/.exec(target);
    if (!m) throw new Error(`unsupported target: ${target}`);
    const [_, repo, subpath] = m;
    const path = subpath ? `${subpath.replace(/\/$/, "")}/package.json` : "package.json";
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "oqqq-backend/0.1", "Accept": "application/vnd.github+json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`cannot read plugin manifest (HTTP ${res.status})`);
    const data = await res.json() as { content?: string; encoding?: string };
    if (data.encoding !== "base64" || !data.content) throw new Error("unexpected GitHub API response");
    const pkg = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8")) as { dsh?: { permissions?: string[] } };
    const permissions = pkg.dsh?.permissions ?? ["(manifest declares no permissions — review repo before installing)"];
    return { target, permissions, repo: `https://github.com/${repo}` };
  }

  /**
   * Install a plugin. `confirmed` must equal the permission list returned
   * by permissions() — the server refuses to install on mismatch, so the
   * frontend cannot skip the confirmation step.
   */
  async install(target: string, confirmed: string[]): Promise<{ ok: boolean; output: string }> {
    const { permissions } = await this.permissions(target);
    const a = [...permissions].sort().join("\n");
    const b = [...confirmed].sort().join("\n");
    if (a !== b) throw new Error("permission confirmation mismatch — user must confirm the exact permission list");
    const output = await new Promise<string>((resolve, reject) => {
      const p = execFile(process.execPath, [DSH_BIN, "plugin", "--profile", "web", "add", target],
        { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (err) reject(new Error((stderr || err.message).slice(0, 500)));
          else resolve((stdout || "").slice(0, 2000));
        });
      p.on("error", reject);
    });
    return { ok: true, output };
  }
}
