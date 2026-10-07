/* 通用 UI 原语：Tooltip / Modal / Switch / EmptyState / Skeleton / Badge */
import {
  cloneElement, useEffect, useId, useRef, useState,
  type CSSProperties, type ReactElement, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../icons/Icons';

/* ---------------- Tooltip（文档 §04：悬停提供名称 Tooltip） ---------------- */
export function Tooltip({
  label, placement = 'right', children,
}: {
  label: string; placement?: 'right' | 'bottom' | 'top';
  children: ReactElement;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLElement | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(placement === 'right'
      ? { x: r.right + 8, y: r.top + r.height / 2 }
      : { x: r.left + r.width / 2, y: placement === 'bottom' ? r.bottom + 8 : r.top - 8 });
  };
  const hide = () => setPos(null);

  return (
    <>
      {cloneElement(children, {
        ref, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide,
      } as Record<string, unknown>)}
      {pos && createPortal(
        <span
          className="tip"
          role="tooltip"
          style={{
            left: pos.x, top: pos.y,
            transform: placement === 'right'
              ? 'translateY(-50%)'
              : 'translateX(-50%) translateY(-100%)',
          } as CSSProperties}
        >{label}</span>,
        document.body,
      )}
    </>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({
  title, description, onClose, children, footer, width = 520, dismissible = true,
  badge,
}: {
  title: string; description?: string; onClose: () => void;
  children: ReactNode; footer?: ReactNode; width?: number;
  /** 完结导出进行中：不可关闭（文档 §05 MUST） */
  dismissible?: boolean;
  badge?: { tone: 'info' | 'warn' | 'bad' | 'ok'; text: string };
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();
    return () => { (restoreRef.current as HTMLElement | null)?.focus?.(); };
  }, []);

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissible, onClose]);

  return createPortal(
    <div className="modal-layer" onMouseDown={dismissible ? e => {
      if (e.target === e.currentTarget) onClose();
    } : undefined}>
      <div
        className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{ width }}
      >
        <header className="modal__head">
          <div>
            <h2 id={titleId} className="modal__title">{title}</h2>
            {description && <p className="modal__desc">{description}</p>}
          </div>
          {badge && <span className={`pill pill--${badge.tone}`}>{badge.text}</span>}
          {dismissible && (
            <button ref={closeRef} className="iconbtn iconbtn--muted modal__x" onClick={onClose} aria-label="关闭">
              <Icon name="close" size={18} />
            </button>
          )}
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Switch ---------------- */
export function Switch({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      className={`switch${checked ? ' switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__knob" />
    </button>
  );
}

/* ---------------- 状态占位（状态先行：empty / error / loading） ---------------- */
export function EmptyState({
  icon = 'info', title, hint, action,
}: {
  icon?: IconName; title: string; hint?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={26} /></span>
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
      {action && <button className="btn btn--ghost" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 12, style }: { w?: number | string; h?: number; style?: CSSProperties }) {
  return <span className="skel" style={{ width: w, height: h, ...style }} aria-hidden />;
}

/* ---------------- Badge / Pill ---------------- */
export function Pill({ tone, children }: { tone: 'info' | 'ok' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function StatusDot({ tone, label }: { tone: 'ok' | 'warn' | 'bad' | 'idle'; label: string }) {
  return <span className={`sdot sdot--${tone}`} role="img" aria-label={label} title={label} />;
}

/* ---------------- 头像（AssetRef 解析，不拼本地绝对路径） ---------------- */
export function Avatar({
  ref: asset, size = 40, radius = 'card',
}: { ref?: import('../../types/model').AssetRef; size?: number; radius?: 'field' | 'card' | 'round' }) {
  const style: CSSProperties = {
    width: size, height: size,
    borderRadius: radius === 'round' ? '50%'
      : radius === 'field' ? 'var(--radius-field)' : 'var(--radius-card)',
  };
  if (!asset) return <span className="avatar" style={{ ...style, background: 'var(--gray-200)' }} />;
  if (asset.kind === 'url') {
    return <img className="avatar" src={asset.value} alt="" style={style} />;
  }
  if (asset.kind === 'emoji') {
    return <span className="avatar" style={{ ...style, background: 'var(--gray-200)', fontSize: size * 0.5 }}>{asset.value}</span>;
  }
  return (
    <span
      className="avatar"
      style={{ ...style, background: asset.tint ?? 'var(--blue-500)', fontSize: Math.round(size * 0.38) }}
    >{asset.value}</span>
  );
}

/* ---------------- 时间格式（像素诚实：统一格式） ---------------- */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return hhmm;
  const yest = new Date(now.getTime() - 864e5);
  if (d.toDateString() === yest.toDateString()) return `昨天 ${hhmm}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return sameYear ? md : `${d.getFullYear()}年${md}`;
}
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
