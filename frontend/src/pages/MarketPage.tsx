/* ============================================================
   插件广场第三方 · dsh-1024store（设计文档 §11）
   安装三步不可省：查权限 → 确认弹窗 → 提交安装。
   前端不拼接、不执行任何 shell 命令，只提交市场返回的 installSpec。
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Capability, PermissionSummary } from '../types/model';
import type { MarketSort } from '../data/client';
import { useClient, useSnapshot } from '../store/useOqqq';
import { EmptyState, Modal, Pill, Skeleton } from '../components/ui/Primitives';
import { Icon } from '../components/icons/Icons';

type Tone = 'info' | 'ok' | 'warn' | 'bad' | 'muted';

const RISK_TONE: Record<PermissionSummary['risk'], Tone> = {
  high: 'bad', medium: 'warn', low: 'muted',
};

const SORTS: { id: MarketSort; label: string }[] = [
  { id: 'installs', label: '安装量' },
  { id: 'stars', label: '评分排行' },
];

function statusMeta(st: Capability['installState']): { tone: Tone; label: string } {
  switch (st.status) {
    case 'installed':
      return { tone: 'ok', label: '已安装' };
    case 'installing': return { tone: 'info', label: '安装中' };
    case 'failed': return { tone: 'bad', label: '安装失败' };
    case 'not_installed': return { tone: 'muted', label: '未安装' };
  }
}

function formatCount(n: number | undefined): string {
  if (n === undefined) return '—';
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return n.toLocaleString('en-US');
}

/* 冷却倒计时：只在冷却期内每秒跳一次，清理由 effect 负责 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/* ---------------- 结果卡片 ---------------- */
function MarketCard({
  cap, busy, onStart,
}: {
  cap: Capability;
  busy: boolean;
  onStart: (cap: Capability) => void;
}) {
  const meta = statusMeta(cap.installState);
  const inst = cap.installState;
  const installed = inst.status === 'installed';
  const installing = inst.status === 'installing';
  const failed = inst.status === 'failed';
  const mp = cap.marketplace;
  const engines = cap.compatibleEngineIds?.length ? cap.compatibleEngineIds.join('、') : '全部引擎';

  return (
    <article className="cap-card" aria-label={`${cap.name} ${meta.label}`}>
      <div className="cap-card__head">
        <h3 className="cap-card__name mono">{cap.name}</h3>
        <span className="cap-card__ver tnum">v{cap.version}</span>
        <span className="cap-card__state"><Pill tone={meta.tone}>{meta.label}</Pill></span>
      </div>

      {cap.description && <p className="cap-card__desc">{cap.description}</p>}

      <div className="cap-meta">
        <span>来自 {mp?.owner ?? cap.source}</span>
        {mp?.category && <><span className="cap-meta__sep" aria-hidden>·</span><span className="mono">{mp.category}</span></>}
        {mp?.url && (
          <a className="cap-meta__link" href={mp.url} target="_blank" rel="noreferrer">
            仓库<Icon name="external" size={11} />
          </a>
        )}
      </div>

      <div className="mkt-stats">
        <span className="mkt-stat tnum"><Icon name="sparkle" size={12} /><span className="sr-only">星标数</span>{formatCount(mp?.stars)}</span>
        <span className="mkt-stat tnum"><Icon name="download" size={12} /><span className="sr-only">安装量</span>{formatCount(mp?.installs)}</span>
        <span className="mkt-stat mkt-stat--engine"><Icon name="terminal" size={12} /><span className="sr-only">兼容引擎</span>{engines}</span>
      </div>

      <div className="cap-foot">
        {installed ? (
          <>
            <button type="button" className="btn" disabled>已安装</button>
            <span className="cap-foot__note">已进入本地能力清单</span>
          </>
        ) : installing ? (
          <>
            <button type="button" className="btn" disabled>安装中 · {inst.stage}</button>
            <span className="cap-foot__pct tnum">{inst.progress}%</span>
          </>
        ) : failed ? (
          <>
            <button type="button" className="btn btn--danger" onClick={() => onStart(cap)}>重试安装</button>
            <span className="cap-foot__note">{inst.stage}失败：{inst.error}</span>
          </>
        ) : busy ? (
          <button type="button" className="btn" disabled>获取权限中</button>
        ) : (
          <>
            <button type="button" className="btn btn--primary" onClick={() => onStart(cap)}>安装</button>
            <span className="cap-foot__note">安装前先确认权限</span>
          </>
        )}
      </div>

      {installing && (
        <div className="cap-prog" role="progressbar" aria-valuenow={inst.progress} aria-valuemin={0} aria-valuemax={100} aria-label="安装进度">
          <span className="cap-prog__fill" style={{ width: `${inst.progress}%` }} />
        </div>
      )}
    </article>
  );
}

/* ---------------- 权限确认弹窗（三步的第 2、3 步） ---------------- */
function ReviewDialog({
  review, cap, submitting, modalError, agree, onAgree, onConfirm, onClose,
}: {
  review: { target: string; perms: string[] };
  cap: Capability | undefined;
  submitting: boolean;
  modalError: string | null;
  agree: boolean;
  onAgree: (v: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const declared = new Map((cap?.permissions ?? []).map(p => [p.id, p]));
  const known = review.perms.filter(id => declared.has(id));
  const unknownIds = review.perms.filter(id => !declared.has(id));

  return (
    <Modal
      title={`确认安装 · ${cap?.name ?? review.target}`}
      description="安装前逐条核对该插件申请的权限；确认后才会写入本地能力清单。"
      onClose={onClose}
      width={520}
      badge={{ tone: 'info', text: '第三方 · dsh-1024store' }}
      footer={<>
        <button type="button" className="btn" onClick={onClose} disabled={submitting}>取消</button>
        <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={!agree || submitting}>
          {submitting ? '提交中' : '确认安装'}
        </button>
      </>}
    >
      <ul className="mkt-perms">
        {known.length === 0 && <li className="mkt-perms__none">该插件未申请任何权限。</li>}
        {known.map(id => {
          const p = declared.get(id)!;
          return (
            <li key={id} className="mkt-perms__row">
              <Pill tone={RISK_TONE[p.risk]}>{p.label}</Pill>
              <span className="mkt-perms__id mono">{id}</span>
              <span className="mkt-perms__risk">{p.risk === 'high' ? '高风险' : p.risk === 'medium' ? '中风险' : '低风险'}</span>
            </li>
          );
        })}
      </ul>

      {unknownIds.length > 0 && (
        <div className="mkt-unknown" role="alert">
          <Icon name="warning" size={14} />
          <span>
            广场返回了 {unknownIds.length} 个目录未记录的权限：{unknownIds.join('、')}。
            安装前请核对插件来源。
          </span>
        </div>
      )}

      <div className="mkt-submit">
        <p className="mkt-submit__label">将提交给后端的权限清单（与广场返回逐字一致，顺序无关）</p>
        <div className="mkt-submit__ids">
          {review.perms.map(id => <code key={id} className="mono">{id}</code>)}
        </div>
        <p className="mkt-submit__target">目标安装规格 <code className="mono">{review.target}</code></p>
      </div>

      <p className="mkt-safety">
        <Icon name="shield" size={13} />
        前端不拼接、不执行任何 shell 命令，只把市场返回的安装规格提交给本地守护进程。
      </p>

      <label className="mkt-agree">
        <input
          type="checkbox"
          className="cap-check"
          checked={agree}
          onChange={e => onAgree(e.target.checked)}
        />
        <span>我已阅读并同意上述权限</span>
      </label>

      {modalError && (
        <div className="mkt-flow-error" role="alert">
          <Icon name="error" size={14} />
          <span>{modalError}</span>
          <button type="button" className="btn btn--sm" onClick={onConfirm} disabled={!agree || submitting}>重试</button>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- 页面 ---------------- */
export function MarketPage() {
  const s = useSnapshot();
  const client = useClient();

  const [q, setQ] = useState(s.marketQuery);
  const [sort, setSort] = useState<MarketSort>(s.marketSort);
  const fired = useRef(s.marketQuery);
  const timer = useRef(0);

  /* 三步安装的弹窗状态 */
  const [review, setReview] = useState<{ capId: string; target: string; perms: string[] } | null>(null);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const submit = useCallback((term: string, mode: MarketSort) => {
    window.clearTimeout(timer.current);
    fired.current = term;
    void client.searchMarket(term, mode);
  }, [client]);

  /* 输入防抖 350ms；回车与排序切换由 handler 立即提交，防抖定时器随之清除 */
  useEffect(() => {
    if (q === fired.current) return;
    timer.current = window.setTimeout(() => submit(q, sort), 350);
    return () => { window.clearTimeout(timer.current); };
  }, [q, sort, submit]);

  const pickSort = (mode: MarketSort) => {
    if (mode === sort) return;
    setSort(mode);
    submit(q, mode);
  };

  const cooling = s.marketCooldownUntil > Date.now();
  const now = useNow(cooling);
  const remaining = cooling ? Math.ceil((s.marketCooldownUntil - now) / 1000) : 0;

  /* 结果展示：检索词与排序以快照为准；本地只做展示层的过滤与排序 */
  const items = (() => {
    const term = s.marketQuery.trim().toLowerCase();
    const hit = (p: Capability) =>
      !term || `${p.name} ${p.description ?? ''} ${p.marketplace?.owner ?? ''} ${p.source}`.toLowerCase().includes(term);
    const key = (p: Capability) => (s.marketSort === 'stars' ? p.marketplace?.stars ?? 0 : p.marketplace?.installs ?? 0);
    return s.plugins.filter(hit).sort((a, b) => key(b) - key(a));
  })();

  const reviewCap = review ? s.plugins.find(p => p.id === review.capId) : undefined;

  const startInstall = async (cap: Capability) => {
    const target = cap.marketplace?.installSpec;
    if (!target) {
      setBanner(`${cap.name} 没有返回安装规格，无法发起权限查询；刷新广场后重试。`);
      return;
    }
    setBanner(null);
    setBusyId(cap.id);
    try {
      const perms = await client.getPluginPermissions(target);
      setBusyId(null);
      setAgree(false);
      setModalError(null);
      setReview({ capId: cap.id, target, perms });
    } catch {
      setBusyId(null);
      setBanner('权限查询失败，请检查与本地守护进程的连接后重试。');
    }
  };

  const confirmInstall = async () => {
    if (!review || !agree || submitting) return;
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await client.installPlugin(review.target, [...review.perms]);
      if (res.ok) setReview(null);
      else setModalError(res.error ?? '安装未完成，可重试。');
    } catch {
      setModalError('安装请求失败，请检查与本地守护进程的连接后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cap-page">
      <div className="cap-scroll">
        <header className="cap-head">
          <div className="cap-head__text">
            <div className="mkt-title-row">
              <h1 className="cap-head__title">插件广场</h1>
              <span className="pill pill--info">第三方 · dsh-1024store</span>
            </div>
            <p className="cap-head__hint">浏览第三方插件；安装前会先展示权限清单，确认后才写入本地能力。</p>
          </div>
          <span className="cap-head__stat tnum">{items.length} 个结果</span>
        </header>

        <div className="mkt-bar">
          <div className="mkt-search">
            <span className="mkt-search__icon"><Icon name="search" size={15} /></span>
            <input
              className="input mkt-search__input"
              type="search"
              value={q}
              placeholder="搜索插件名、简介或作者"
              aria-label="搜索插件"
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(q, sort); }}
            />
          </div>
          <div className="mkt-sort" role="group" aria-label="排序">
            {SORTS.map(o => (
              <button
                key={o.id}
                type="button"
                className={`mkt-chip${sort === o.id ? ' mkt-chip--on' : ''}`}
                aria-pressed={sort === o.id}
                onClick={() => pickSort(o.id)}
                disabled={s.marketLoading}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cap-body">
          {s.marketError && (
            <div className="mkt-alert" role="alert">
              <Icon name="warning" size={15} />
              <span>{s.marketError}</span>
              {remaining > 0 && <span className="tnum">剩余 {remaining} 秒</span>}
              <button
                type="button"
                className="btn btn--sm mkt-alert__retry"
                onClick={() => submit(q, sort)}
                disabled={remaining > 0 || s.marketLoading}
              >
                重新检索
              </button>
            </div>
          )}
          {banner && (
            <div className="mkt-alert mkt-alert--bad" role="alert">
              <Icon name="error" size={15} />
              <span>{banner}</span>
            </div>
          )}

          {s.marketLoading ? (
            <div className="cap-grid" aria-busy="true">
              <span className="sr-only" role="status">正在检索插件广场</span>
              {[0, 1, 2, 3].map(i => (
                <article key={i} className="cap-card cap-card--skel">
                  <Skeleton h={15} w="42%" />
                  <Skeleton h={12} w="86%" />
                  <Skeleton h={12} w="64%" />
                  <Skeleton h={26} w={96} style={{ marginTop: 'auto' }} />
                </article>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon="search"
              title="没有匹配的插件"
              hint="换个关键词，或清空搜索查看全部结果。"
              action={{ label: '清空搜索', onClick: () => { setQ(''); submit('', sort); } }}
            />
          ) : (
            <div className="cap-grid">
              {items.map(cap => (
                <MarketCard
                  key={cap.id}
                  cap={cap}
                  busy={busyId === cap.id}
                  onStart={cap2 => { void startInstall(cap2); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {review && (
        <ReviewDialog
          review={review}
          cap={reviewCap}
          submitting={submitting}
          modalError={modalError}
          agree={agree}
          onAgree={setAgree}
          onConfirm={() => { void confirmInstall(); }}
          onClose={() => setReview(null)}
        />
      )}
    </div>
  );
}
