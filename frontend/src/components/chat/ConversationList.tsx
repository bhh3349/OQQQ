/* 会话列表：群聊与单聊混排，支持置顶与未读（文档 §04 / §05） */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation } from '../../types/model';
import { Icon } from '../icons/Icons';
import { Avatar, EmptyState, formatTime } from '../ui/Primitives';
import { useClient, useSnapshot } from '../../store/useOqqq';

export function ConversationList({
  activeId, onSelect, onCreate,
}: {
  activeId: string; onSelect: (id: string) => void;
  onCreate: (kind: 'direct' | 'group') => void;
}) {
  const s = useSnapshot();
  const client = useClient();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menu]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return s.conversations.filter(c => {
      if (!kw) return true;
      const last = c.lastMessage?.text.toLowerCase() ?? '';
      return c.title.toLowerCase().includes(kw) || last.includes(kw);
    });
  }, [s.conversations, q]);

  return (
    <div className="sess">
      <div className="sess__tools">
        <div className="sess__search">
          <span className="sess__search-icon"><Icon name="search" size={14} /></span>
          <input
            className="input" type="search" placeholder="搜索"
            value={q} onChange={e => setQ(e.target.value)}
            aria-label="搜索会话"
          />
        </div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            className="sess__add" aria-label="新建" aria-haspopup="menu" aria-expanded={menu}
            onClick={() => setMenu(v => !v)}
          >
            <Icon name="plus" size={16} />
          </button>
          {menu && (
            <div className="menu" role="menu">
              <button role="menuitem" onClick={() => { setMenu(false); onCreate('direct'); }}>
                <Icon name="user" size={15} />创建聊天
              </button>
              <button role="menuitem" onClick={() => { setMenu(false); onCreate('group'); }}>
                <Icon name="contacts" size={15} />创建群聊
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sess__list" role="list" aria-label="会话列表">
        {list.length === 0 && (
          <EmptyState
            icon="search" title="没有匹配的会话"
            hint={q ? `换个关键词，或清空「${q}」` : '点上方「+」创建聊天或群聊'}
          />
        )}
        {list.map(c => (
          <ConvRow
            key={c.id} c={c}
            active={c.id === activeId}
            onSelect={() => onSelect(c.id)}
            onTogglePin={() => client.setPinned(c.id, !c.pinned)}
            onToggleMute={() => client.setMuted(c.id, !c.muted)}
          />
        ))}
      </div>
    </div>
  );
}

function ConvRow({
  c, active, onSelect, onTogglePin, onToggleMute,
}: {
  c: Conversation; active: boolean; onSelect: () => void;
  onTogglePin: () => void; onToggleMute: () => void;
}) {
  const draft = c.draft?.trim();
  const preview = draft ? `[草稿] ${draft}` : (c.lastMessage?.text ?? '暂无消息');
  return (
    <div role="listitem" className={`sess__item${c.muted ? ' sess__item--muted' : ''}`}>
      <button
        type="button" className="sess__main" data-active={active}
        onClick={onSelect}
      >
        <Avatar ref={c.avatar} size={40} />
        <span className="sess__body">
          <span className="sess__row">
            <span className="sess__name">{c.title}</span>
            {c.lastMessage && <span className="sess__time tnum">{formatTime(c.lastMessage.at)}</span>}
          </span>
          <span className="sess__row2">
            {draft && <Icon name="retry" size={11} className="sess__draft" />}
            <span className="sess__preview">{preview}</span>
            {c.pinned && <Icon name="pin" size={11} className="sess__pin" />}
            {c.muted && <Icon name="bellOff" size={12} className="sess__flag" />}
            {c.readOnly && <Icon name="shield" size={11} className="sess__flag" />}
            {c.unreadCount > 0 && (
              <span
                className={`sess__unread${c.muted ? ' sess__unread--dot' : ' tnum'}`}
                aria-label={`${c.unreadCount} 条未读`}
              >
                {c.muted ? '' : c.unreadCount > 99 ? '99+' : c.unreadCount}
              </span>
            )}
          </span>
        </span>
      </button>
      <span className="sess__acts">
        <button
          type="button" className="iconbtn"
          title={c.pinned ? '取消置顶' : '置顶'}
          aria-label={`${c.pinned ? '取消置顶' : '置顶'}：${c.title}`}
          onClick={onTogglePin}
        >
          <Icon name="pin" size={13} />
        </button>
        <button
          type="button" className="iconbtn"
          title={c.muted ? '取消静音' : '消息免打扰'}
          aria-label={`${c.muted ? '取消静音' : '消息免打扰'}：${c.title}`}
          onClick={onToggleMute}
        >
          <Icon name={c.muted ? 'bellOff' : 'bell'} size={13} />
        </button>
      </span>
    </div>
  );
}
