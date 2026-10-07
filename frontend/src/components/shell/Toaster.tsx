/* 瞬时反馈：toast 与连接横幅。都不进快照，靠事件流驱动。 */
import { useEffect, useState } from 'react';
import { Icon } from '../icons/Icons';
import { useClient, useOqqqEvent, useSnapshot } from '../../store/useOqqq';

type Toast = { id: number; tone: 'info' | 'success' | 'warning' | 'error'; text: string };
let toastSeq = 0;

const TONE_ICON = { info: 'info', success: 'check', warning: 'warning', error: 'error' } as const;

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useOqqqEvent(e => {
    if (e.type !== 'toast') return;
    const id = ++toastSeq;
    setItems(prev => [...prev.slice(-3), { id, tone: e.tone, text: e.text }]);
  });

  useEffect(() => {
    if (!items.length) return;
    const t = setTimeout(() => setItems(prev => prev.slice(1)), 4200);
    return () => clearTimeout(t);
  }, [items]);

  if (!items.length) return null;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <Icon name={TONE_ICON[t.tone]} size={16} />
          <span>{t.text}</span>
          <button
            className="toast__x" aria-label="关闭提示"
            onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** 后端未连接：全局离线条，可重连（文档 §16 关键失败态） */
export function ConnectionBanner() {
  const s = useSnapshot();
  const client = useClient();
  if (s.connection === 'online') return null;

  const down = s.connection === 'backend_down';
  const text = down
    ? (s.connectionDetail ?? 'OQQQ Core 未响应，所有会话转为只读')
    : s.connection === 'reconnecting'
      ? '正在重新连接后端…'
      : '后端未连接，消息不会派发';

  return (
    <div className={`banner banner--${down ? 'bad' : 'warn'}`} role="alert">
      <Icon name={down ? 'error' : 'warning'} size={15} />
      <span className="banner__text">{text}</span>
      {s.connection !== 'reconnecting' && (
        <button className="banner__act" onClick={() => void client.reconnect()}>重新连接</button>
      )}
    </div>
  );
}
