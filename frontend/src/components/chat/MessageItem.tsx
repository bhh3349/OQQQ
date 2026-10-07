/* ============================================================
   单条消息渲染 —— 覆盖文档 §08 全部 7 种类型
   文本一律走 React 节点切分，不使用 dangerouslySetInnerHTML：
   契约里 system.payload.html 已在 wire.ts 降级为纯文本（文档 §16 内容净化）。
   ============================================================ */
import { useState, type ReactNode } from 'react';
import type { Message } from '../../types/model';
import { Icon } from '../icons/Icons';
import { Avatar, Pill, formatBytes, formatClock } from '../ui/Primitives';

/** 把 @名字 切成高亮节点；不解析任意标记，避免富文本注入 */
function renderText(text: string, names: Map<string, string>): ReactNode[] {
  if (!text) return [];
  const out: ReactNode[] = [];
  const re = /@([^\s@，。,;；:：()（）]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[1];
    const known = names.has(token);
    out.push(
      <span key={`at${k++}`} className={known ? 'mention' : undefined}>
        {m[0]}
        {known ? '' : ''}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export type MsgActions = {
  onReply: (m: Message) => void;
  onRetry: (m: Message) => void;
  onEdit: (m: Message) => void;
  onApprove: (m: Message, approved: boolean) => void;
  onOpenFiles: () => void;
};

export function MessageItem({
  message: msg, self, names, actions,
}: {
  message: Message; self: boolean;
  names: Map<string, string>; actions: MsgActions;
}) {
  switch (msg.kind) {
    case 'system': return <SystemRow text={textOf(msg)} />;
    case 'summary': return <SummaryCard msg={msg} />;
    case 'tool_event': return <ToolCard msg={msg} actions={actions} />;
    case 'task_event': return <TaskCard msg={msg} self={self} names={names} actions={actions} />;
    case 'file_event': return <FileRow msg={msg} self={self} names={names} actions={actions} />;
    default: return <Bubble msg={msg} self={self} names={names} actions={actions} />;
  }
}

const textOf = (m: Message) => m.content.find(b => b.type === 'text')?.text ?? '';

/* ---------------- 系统事件：居中灰行，不冒充成员发言 ---------------- */
function SystemRow({ text }: { text: string }) {
  return <div className="msg-sys">{text}</div>;
}

/* ---------------- 气泡（human / agent） ---------------- */
function Bubble({
  msg, self, names, actions,
}: { msg: Message; self: boolean; names: Map<string, string>; actions: MsgActions }) {
  const running = msg.run && (msg.run.state === 'queued' || msg.run.state === 'running');
  const streaming = msg.run?.state === 'streaming';
  const failed = msg.run?.state === 'failed';
  const body = textOf(msg);

  return (
    <article className={`msg${self ? ' msg--self' : ''}`}>
      {!self && <Avatar ref={msg.sender.avatar} size={36} />}
      <div className="msg__col">
        {!self && (
          <div className="msg__who">
            <span>{msg.sender.name}</span>
            {msg.sender.engineId && <span className="msg__engine">{msg.sender.engineId}</span>}
          </div>
        )}
        <div className="bubble">
          {msg.replyTo && (
            <div className="bubble__quote">
              <b>{msg.replyTo.senderName}</b>：{msg.replyTo.preview.slice(0, 60)}
            </div>
          )}
          {running && !body
            ? <span className="runstate"><i className="runstate__spin" />{msg.run!.state === 'queued' ? '已接收' : '正在处理'}</span>
            : <>{renderText(body, names)}{streaming && <i className="caret" />}</>}
          {msg.content.filter(b => b.type === 'code').map((b, i) => (
            b.type === 'code' ? <pre key={i} className="bubble__pre">{b.text}</pre> : null
          ))}
          {msg.content.filter(b => b.type === 'file').map((b, i) => (
            b.type === 'file' ? (
              <div key={i} className="msg-file" style={{ marginTop: 6 }}>
                <span className="msg-file__ic"><Icon name="file" size={16} /></span>
                <span>
                  <span className="msg-file__name">{b.name}</span>
                  <span className="msg-file__meta tnum">{formatBytes(b.size)}</span>
                </span>
              </div>
            ) : null
          ))}
        </div>
        {failed && (
          <div className="msg__failed">
            <Icon name="warning" size={13} />
            <span>生成中断，已保留输出内容</span>
            <button className="btn" onClick={() => actions.onRetry(msg)}>重试</button>
          </div>
        )}
        <div className="msg__col">
          <span className="bubble__time tnum">{formatClock(msg.createdAt)}</span>
        </div>
      </div>
      <div className="msg__tools">
        <button className="iconbtn" title="引用回复" aria-label="引用回复" onClick={() => actions.onReply(msg)}>
          <Icon name="attach" size={14} />
        </button>
        {self && msg.kind === 'human' && (
          <button className="iconbtn" title="编辑后重发" aria-label="编辑后重发" onClick={() => actions.onEdit(msg)}>
            <Icon name="retry" size={14} />
          </button>
        )}
      </div>
    </article>
  );
}

/* ---------------- 阶段总结卡 ---------------- */
function SummaryCard({ msg }: { msg: Message }) {
  const s = msg.summary;
  const [open, setOpen] = useState(false);
  if (!s) return null;
  return (
    <section className="msg-sum">
      <header className="msg-sum__head">
        <Icon name="sparkle" size={15} />
        <h3 className="msg-sum__title">{s.period}</h3>
        <button
          className="msg-sum__range btn btn--ghost btn--sm"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          {open ? '收起来源' : '查看来源范围'}
        </button>
      </header>
      <div className="msg-sum__body">
        <Section title="决策" items={s.decisions} />
        <Section title="进度" items={s.progress} />
        <Section title="阻塞" items={s.blockers} blocked />
        {open && (
          <p className="field__hint">
            覆盖范围 {s.coversFrom ?? '—'} → {s.coversTo ?? '当前'}；
            工具事件、系统事件与更早的总结不计入触发阈值。
          </p>
        )}
      </div>
    </section>
  );
}
function Section({ title, items, blocked }: { title: string; items: string[]; blocked?: boolean }) {
  if (!items.length) return null;
  return (
    <div className={`msg-sum__sec${blocked ? ' msg-sum__sec--block' : ''}`}>
      <h4>{title}</h4>
      <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

/* ---------------- 工具事件：默认折叠，只给动作与结果 ---------------- */
function ToolCard({
  msg, actions,
}: { msg: Message; actions: MsgActions }) {
  const t = msg.toolEvent;
  const [open, setOpen] = useState(false);
  if (!t) return null;
  const tone = t.approval === 'denied' ? 'muted' : t.approval === 'pending' ? 'warn' : 'info';
  const label = t.approval === 'pending' ? '待审批'
    : t.approval === 'denied' ? '已拒绝'
      : t.approval === 'approved' ? '已批准' : '已完成';

  return (
    <article className={`msg${self ? ' msg--self' : ''}`}>
      {!self && <Avatar ref={msg.sender.avatar} size={36} />}
      <div className="msg__col" style={{ maxWidth: '100%' }}>
        {!self && <div className="msg__who"><span>{msg.sender.name}</span></div>}
        <div className={`msg-tool${open ? ' msg-tool--open' : ''}`}>
          <button
            className="msg-tool__head" aria-expanded={open}
            onClick={() => setOpen(v => !v)}
          >
            <Icon name="terminal" size={14} />
            <span className="msg-tool__name">{t.tool}</span>
            <span className="msg-tool__act">{t.action}</span>
            <Pill tone={tone}>{label}</Pill>
            <Icon name="chevronDown" size={14} className="msg-tool__chev" />
          </button>
          {open && (
            <div className="msg-tool__body">
              {t.resultSummary ?? '无结果摘要'}
              {t.hasAuditDetail && (
                <p className="msg-tool__audit">
                  原始参数与完整输出不进入群聊，需审计请打开工具详情页。
                </p>
              )}
            </div>
          )}
        </div>
        {t.approval === 'pending' && (
          <div className="approval" role="group" aria-label="工具审批">
            <Icon name="shield" size={14} />
            <span>
              {msg.sender.name} 请求执行 <code>{t.tool}</code> → {t.action}
            </span>
            <span className="spacer" />
            <button className="btn btn--sm btn--danger" onClick={() => actions.onApprove(msg, false)}>拒绝</button>
            <button className="btn btn--sm btn--primary" onClick={() => actions.onApprove(msg, true)}>批准</button>
          </div>
        )}
        {t.approval === 'denied' && (
          <div className="approval approval--denied">
            <Icon name="close" size={14} /><span>你已拒绝，该操作不会重复请求。</span>
          </div>
        )}
        {t.approval === 'approved' && (
          <div className="approval approval--ok">
            <Icon name="check" size={14} /><span>已批准，发起者与目标路径见折叠详情。</span>
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------------- 任务卡 ---------------- */
const TASK_TONE = { open: 'info', in_progress: 'warn', blocked: 'bad', done: 'ok' } as const;
const TASK_TEXT = { open: '待处理', in_progress: '进行中', blocked: '阻塞', done: '已完成' } as const;

function TaskCard({
  msg, self, actions,
}: { msg: Message; self: boolean; names: Map<string, string>; actions: MsgActions }) {
  const t = msg.taskEvent;
  if (!t) return null;
  return (
    <article className={`msg${self ? ' msg--self' : ''}`}>
      {!self && <Avatar ref={msg.sender.avatar} size={36} />}
      <div className="msg__col">
        <div className="msg-task">
          <div className="msg-task__top">
            <Icon name="check" size={14} />
            <span className="msg-task__label">任务 {t.taskId}</span>
            <Pill tone={TASK_TONE[t.state]}>{TASK_TEXT[t.state]}</Pill>
          </div>
          <p className="msg-task__title">{t.title}</p>
          <div className="msg-task__meta">
            <Icon name="user" size={12} />
            <span>负责人：{t.assigneeName ?? '未指派'}</span>
            {t.linkedMessageId && (
              <button className="btn btn--ghost btn--sm msg-task__link" onClick={actions.onOpenFiles}>
                关联消息
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ---------------- 文件事件：可跳转群文件 ---------------- */
const FILE_OP = { created: '创建', modified: '修改', deleted: '删除' } as const;

function FileRow({
  msg, self, actions,
}: { msg: Message; self: boolean; names: Map<string, string>; actions: MsgActions }) {
  const f = msg.fileEvent;
  if (!f) return null;
  return (
    <article className={`msg${self ? ' msg--self' : ''}`}>
      {!self && <Avatar ref={msg.sender.avatar} size={36} />}
      <div className="msg__col">
        <div className="msg-file">
          <span className="msg-file__ic"><Icon name="file" size={16} /></span>
          <span style={{ minWidth: 0 }}>
            <span className="msg-file__name">{f.name}</span>
            <span className="msg-file__meta mono">
              {f.initiatorName} {FILE_OP[f.op]} · {f.path}{f.size ? ` · ${formatBytes(f.size)}` : ''}
            </span>
          </span>
          <button className="btn btn--ghost btn--sm msg-file__go" onClick={actions.onOpenFiles}>
            打开群文件
          </button>
        </div>
      </div>
    </article>
  );
}
