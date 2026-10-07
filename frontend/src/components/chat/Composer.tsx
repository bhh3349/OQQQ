/* ============================================================
   输入区（文档 §05/§06/§08/§16）
   群聊：@ 选择器决定执行目标；单聊：不显示 @ 选择器。
   键盘：Enter 发送 · Shift+Enter 换行 · Esc 关闭弹层。
   运行中：发送钮变「停止生成」；失败可重试（在消息流里）。
   只读降级：引擎离线/后端断开时保留历史，只禁用发送。
   ============================================================ */
import {
  useEffect, useMemo, useRef, useState,
  type KeyboardEvent,
} from 'react';
import type { AgentContact, Conversation, Message } from '../../types/model';
import { Icon } from '../icons/Icons';
import { Avatar } from '../ui/Primitives';
import { useClient, useSnapshot } from '../../store/useOqqq';

export type ComposerState = {
  replyTo?: Message;
  editing?: Message;
};

export function Composer({
  conversation, state, onConsumed,
}: {
  conversation: Conversation;
  state: ComposerState;
  onConsumed: () => void;
}) {
  const s = useSnapshot();
  const client = useClient();
  const [text, setText] = useState('');
  const [pop, setPop] = useState(false);
  const [popIdx, setPopIdx] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const isGroup = conversation.kind === 'group';
  const disabled = !!conversation.readOnly || s.connection === 'backend_down' || s.connection === 'offline';

  /* 群成员（除自己）供 @ 选择 */
  const candidates = useMemo<AgentContact[]>(() => {
    if (!isGroup) return [];
    return conversation.memberIds
      .map(id => s.contacts.find(c => c.id === id))
      .filter((c): c is AgentContact => !!c);
  }, [isGroup, conversation.memberIds, s.contacts]);

  /* 切换会话时恢复草稿 */
  useEffect(() => {
    setText(conversation.draft ?? '');
    setPop(false);
    areaRef.current?.focus();          // 焦点管理：新会话进入输入框
  }, [conversation.id]);

  /* 引用 / 编辑预填 */
  useEffect(() => {
    if (state.editing) {
      const t = state.editing.content.find(b => b.type === 'text')?.text ?? '';
      setText(t);
      areaRef.current?.focus();
    } else if (state.replyTo) {
      areaRef.current?.focus();
    }
  }, [state]);

  /* 运行态：本会话是否有进行中的生成 */
  const running = (s.messages[conversation.id] ?? [])
    .some(m => m.run && (m.run.state === 'queued' || m.run.state === 'running' || m.run.state === 'streaming'));

  /* @ 触发弹层：光标前最近的 @token */
  const atQuery = useMemo(() => {
    if (!isGroup) return null;
    const el = areaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const m = /@([^\s@]*)$/.exec(before);
    return m ? m[1] : null;
  }, [text, isGroup, pop]);

  const filtered = useMemo(() => {
    if (atQuery === null) return [];
    const kw = atQuery.toLowerCase();
    return candidates.filter(c =>
      !kw || c.displayName.toLowerCase().includes(kw));
  }, [atQuery, candidates]);

  useEffect(() => { setPop(filtered.length > 0); setPopIdx(0); }, [filtered.length]);

  const insertMention = (c: AgentContact) => {
    const el = areaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]*)$/, `@${c.displayName} `);
    const next = before + text.slice(caret);
    setText(next);
    setPop(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  /* 文本里的 @名字 → 成员 id（只认群成员，避免误路由） */
  const extractMentions = (body: string): string[] => {
    if (!isGroup) return [];
    const ids: string[] = [];
    for (const c of candidates) {
      if (body.includes(`@${c.displayName}`)) ids.push(c.id);
    }
    return ids;
  };

  const doSend = () => {
    const body = text.trim();
    if (!body || disabled) return;
    if (state.editing) {
      void client.editResend(state.editing.id, body);
    } else {
      void client.send(conversation.id, body, extractMentions(body));
    }
    setText('');
    onConsumed();
    client.saveDraft(conversation.id, '');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (pop && filtered.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPopIdx(i => (i + 1) % filtered.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPopIdx(i => (i - 1 + filtered.length) % filtered.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filtered[popIdx]); return; }
    }
    if (e.key === 'Escape') {
      if (pop) { e.preventDefault(); setPop(false); return; }
      if (state.replyTo || state.editing) { e.preventDefault(); onConsumed(); }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  };

  /* 草稿：停止输入 400ms 落盘 */
  useEffect(() => {
    if (state.editing) return;
    const t = setTimeout(() => client.saveDraft(conversation.id, text), 400);
    return () => clearTimeout(t);
  }, [text, conversation.id, state.editing, client]);

  /* 自增高 */
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const quoted = state.editing ?? state.replyTo;

  return (
    <footer className="composer">
      <div className="composer__bar" aria-hidden={disabled}>
        <button className="iconbtn" title="表情" aria-label="表情" disabled={disabled}><Icon name="emoji" size={17} /></button>
        <button className="iconbtn" title="截图" aria-label="截图" disabled={disabled}><Icon name="screenshot" size={17} /></button>
        <button className="iconbtn" title="发送文件" aria-label="发送文件" disabled={disabled}><Icon name="folder" size={17} /></button>
        <button className="iconbtn" title="图片" aria-label="图片" disabled={disabled}><Icon name="image" size={17} /></button>
        <button className="iconbtn" title="视频" aria-label="视频" disabled={disabled}><Icon name="video" size={17} /></button>
        <span className="sep" />
        {isGroup && (
          <button
            className="iconbtn" title="提及 Agent" aria-label="提及 Agent" disabled={disabled}
            onClick={() => {
              const el = areaRef.current; if (!el) return;
              el.focus();
              setText(t => `${t}@`);
            }}
          >
            <Icon name="at" size={17} />
          </button>
        )}
        <span className="spacer" />
        <span className="composer__hint">
          {running ? 'Agent 正在输出' : disabled ? '会话只读' : 'Enter 发送 · Shift+Enter 换行'}
        </span>
      </div>

      <div className="composer__wrap">
        {quoted && (
          <div style={{ padding: '0 20px' }}>
            <div className="bubble__quote" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{state.editing ? '编辑后重发' : `回复 ${quoted.sender.name}`}</b>
                ：{(quoted.content.find(b => b.type === 'text')?.text ?? '').slice(0, 48)}
              </span>
              <button className="iconbtn" aria-label="取消" onClick={onConsumed}><Icon name="close" size={13} /></button>
            </div>
          </div>
        )}

        <textarea
          ref={areaRef}
          className="composer__input"
          value={text}
          disabled={disabled}
          placeholder={disabled
            ? '引擎离线或后端未连接，历史仍可浏览，发送已禁用'
            : isGroup ? '输入消息，@ 可指定 Agent；不 @ 时由 PM 接单' : '发消息给 Agent'}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="消息输入框"
        />

        {pop && filtered.length > 0 && (
          <div className="mention-pop" role="listbox" aria-label="选择要提及的成员">
            <p className="mention-pop__head">提及成员 · @ 决定执行目标</p>
            {filtered.map((c, i) => (
              <button
                key={c.id} role="option" aria-selected={i === popIdx}
                data-active={i === popIdx}
                className="mention-pop__item"
                onMouseEnter={() => setPopIdx(i)}
                onClick={() => insertMention(c)}
              >
                <Avatar ref={c.avatar} size={24} radius="field" />
                <span className="mention-pop__name">{c.displayName}</span>
                {c.role === 'admin' && <span className="mention-pop__role">管理员</span>}
                {c.onboarding === 'pending' && <span className="mention-pop__role">准备中</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="composer__foot">
        <span className="spacer" style={{ flex: 1 }} />
        {running ? (
          <button className="composer__stop" onClick={() => void client.stop(conversation.id)}>
            <Icon name="stop" size={13} />停止生成
          </button>
        ) : (
          <span className="composer__send">
            <button className="btn btn--primary" onClick={doSend} disabled={disabled || !text.trim()}>
              {state.editing ? '保存并重发' : '发送'}
            </button>
            <button className="composer__send-caret" aria-label="发送选项" disabled={disabled || !text.trim()}>
              <Icon name="chevronDown" size={13} />
            </button>
          </span>
        )}
      </div>
    </footer>
  );
}
