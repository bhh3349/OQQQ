/* 消息流：分段加载、日期锚点、流式渲染、自动跟随 */
import { useEffect, useMemo, useRef } from 'react';
import type { Message } from '../../types/model';
import { MessageItem, type MsgActions } from './MessageItem';
import { Skeleton } from '../ui/Primitives';
import { useSnapshot } from '../../store/useOqqq';

const DAY = 86_400_000;

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / DAY);
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff <= 0) return `今天 ${hh}`;
  if (diff === 1) return `昨天 ${hh}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return sameYear ? `${md} ${hh}` : `${d.getFullYear()}年${md} ${hh}`;
}

export function MessageTimeline({
  conversationId, actions, jumpTo,
}: { conversationId: string; actions: MsgActions; jumpTo?: { msgId: string; seq: number } | null }) {
  const s = useSnapshot();
  const list = s.messages[conversationId] ?? [];
  const loading = s.loadingMessages[conversationId];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  /* 流式增量由 mockClient.commit() 重建顶层快照驱动重渲染，
     MessageItem 非 memo，同引用变化即可见 */

  useEffect(() => {
    stickRef.current = true;
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationId]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  });

  /* 外部跳转（群文件 / 搜索）：高亮并滚动到目标消息 */
  useEffect(() => {
    if (!jumpTo) return;
    const el = scrollerRef.current?.querySelector(`[data-mid="${jumpTo.msgId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('msg--flash');
    const t = setTimeout(() => el?.classList.remove('msg--flash'), 1600);
    return () => clearTimeout(t);
  }, [jumpTo]);

  /* 日期锚点 */
  const rows = useMemo(() => {
    const out: { anchor?: string; m: Message }[] = [];
    let prev = 0;
    for (const m of list) {
      if (!prev || m.createdAt - prev > 5 * 60_000 ||
          new Date(prev).toDateString() !== new Date(m.createdAt).toDateString()) {
        out.push({ anchor: dayLabel(m.createdAt), m });
      } else {
        out.push({ m });
      }
      prev = m.createdAt;
    }
    return out;
  }, [list]);

  if (loading) {
    return (
      <div className="timeline timeline__loading" aria-busy="true" aria-label="消息加载中">
        <Skeleton w={220} h={14} style={{ alignSelf: 'center' }} />
        <Skeleton w="52%" h={38} style={{ alignSelf: 'flex-start' }} />
        <Skeleton w="44%" h={38} style={{ alignSelf: 'flex-end' }} />
        <Skeleton w="58%" h={52} style={{ alignSelf: 'flex-start' }} />
      </div>
    );
  }

  return (
    <div className="timeline" ref={scrollerRef} onScroll={onScroll} role="log" aria-label="消息记录">
      {rows.length === 0 && (
        <div className="msg-sys">还没有消息。输入第一句，或 @ 一个 Agent 开始。</div>
      )}
      {rows.map(({ anchor, m }) => (
        <div key={m.id} style={{ display: 'contents' }}>
          {anchor && <div className="timeline__anchor tnum">{anchor}</div>}
          <div data-mid={m.id} style={{ display: 'contents' }}>
            <MessageItem message={m} self={m.sender.kind === 'user'} names={NAMELESS} actions={actions} />
          </div>
        </div>
      ))}
    </div>
  );
}

const NAMELESS = new Map<string, string>();
