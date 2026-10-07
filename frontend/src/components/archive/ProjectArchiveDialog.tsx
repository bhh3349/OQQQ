/* ============================================================
   完结项目对话框（文档 §13 · MUST）
   点击完结 → 确认范围 → 冻结写入 → 导出档案 → 归档群聊
   进行中展示不可关闭的导出进度；档案不含任何密钥原值。
   ============================================================ */
import { useState } from 'react';
import type { Conversation } from '../../types/model';
import { Icon } from '../icons/Icons';
import { Modal, Pill } from '../ui/Primitives';
import { useClient, useOqqqEvent } from '../../store/useOqqq';

type Stage = 'confirm' | 'running' | 'done' | 'failed';

const CHECKS = [
  { id: 'meta', label: '导出群详情', hint: '成员、角色、引擎与可重建配置', locked: true },
  { id: 'files', label: '生成文件清单', hint: '关键交付物与工作区引用', locked: true },
  { id: 'summary', label: '保存总结链', hint: '公告版本 + 阶段总结', locked: true },
  { id: 'freeze', label: '冻结 Agent 任务', hint: '未完成与阻塞任务转入档案', locked: true },
  { id: 'copy', label: '复制工作区', hint: '不勾选则只记录路径引用', locked: false },
] as const;

export function ProjectArchiveDialog({
  conversation, onClose,
}: { conversation: Conversation; onClose: () => void }) {
  const client = useClient();
  const [stage, setStage] = useState<Stage>('confirm');
  const [picked, setPicked] = useState<Record<string, boolean>>(
    Object.fromEntries(CHECKS.map(c => [c.id, c.locked])),
  );
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState('');
  const [result, setResult] = useState<{ path?: string; slots?: string[]; error?: string }>({});

  /* 归档进度：事件流驱动，不进快照 */
  useOqqqEvent(e => {
    if (e.type === 'project.archive_progress') { setProgress(e.progress); setStageLabel(e.stage); }
    if (e.type === 'project.archived') setResult(r => ({ ...r, path: e.archivePath }));
  });

  const run = async () => {
    setStage('running');
    const out = await client.archiveProject(conversation.id, !!picked.copy);
    if (out.ok) {
      setResult(r => ({ ...r, path: r.path ?? out.archivePath, slots: out.credentialSlots }));
      setStage('done');
    } else {
      setResult({ error: out.error });
      setStage('failed');
    }
  };

  /* ---------- 确认范围 ---------- */
  if (stage === 'confirm') {
    return (
      <Modal
        title={`完结项目「${conversation.title}」`}
        description="完结不是删除：生成可重建的项目档案，群聊转为只读但仍可搜索。"
        onClose={onClose} width={560}
        footer={
          <>
            <span className="spacer" />
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn btn--primary" onClick={() => void run()}>开始导出</button>
          </>
        }
      >
        <div className="arch-checks" role="group" aria-label="导出范围">
          {CHECKS.map(c => (
            <label key={c.id} className="arch-check">
              <input
                type="checkbox" checked={picked[c.id] ?? c.locked} disabled={c.locked}
                onChange={e => setPicked(p => ({ ...p, [c.id]: e.target.checked }))}
              />
              <span>
                <span className="arch-check__label">{c.label}{c.locked && <Pill tone="muted">必选</Pill>}</span>
                <span className="arch-check__hint">{c.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="field__hint" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Icon name="shield" size={14} />
          <span>API Key、Token、Cookie 与环境变量原值不会进入档案；档案只记录「需要哪类凭据」与连接状态。</span>
        </p>
      </Modal>
    );
  }

  /* ---------- 进行中：不可关闭（MUST） ---------- */
  if (stage === 'running') {
    return (
      <Modal
        title="正在导出项目档案"
        description="已冻结写入，Agent 任务停止派发。"
        onClose={onClose} dismissible={false} width={520}
        badge={{ tone: 'info', text: `${progress}%` }}
      >
        <div className="arch-prog" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="arch-prog__bar" style={{ width: `${progress}%` }} />
        </div>
        <p className="arch-prog__stage">{stageLabel || '准备中'}…</p>
        <p className="field__hint">进度中断时可从失败阶段重试，不会生成半成品档案。</p>
      </Modal>
    );
  }

  /* ---------- 失败：展示阶段与可复制摘要 ---------- */
  if (stage === 'failed') {
    return (
      <Modal
        title="导出失败"
        description={result.error ?? '未知错误'}
        onClose={onClose} width={520}
        badge={{ tone: 'bad', text: '可重试' }}
        footer={
          <>
            <button
              className="btn"
              onClick={() => { void navigator.clipboard?.writeText(result.error ?? ''); }}
            >复制错误摘要</button>
            <span className="spacer" />
            <button className="btn" onClick={onClose}>稍后处理</button>
            <button className="btn btn--primary" onClick={() => { setStage('confirm'); setProgress(0); }}>
              从失败阶段重试
            </button>
          </>
        }
      >
        <p className="field__hint">失败不影响群聊继续工作；工作区文件未被修改。</p>
      </Modal>
    );
  }

  /* ---------- 完成：三个结果动作 ---------- */
  return (
    <Modal
      title="项目已归档"
      description={`「${conversation.title}」转为只读，仍可在消息页搜索。`}
      onClose={onClose} width={560}
      badge={{ tone: 'ok', text: '完成' }}
      footer={<button className="btn btn--primary" onClick={onClose}>知道了</button>}
    >
      <p className="mono" style={{ fontSize: 'var(--fs-12)', background: 'var(--gray-100)', padding: '8px 10px', borderRadius: 'var(--radius-field)', wordBreak: 'break-all' }}>
        {result.path}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn--sm" onClick={() => { /* 桌面壳内由容器打开 */ }}>打开档案位置</button>
        <button
          className="btn btn--sm"
          onClick={() => { void navigator.clipboard?.writeText(result.path ?? ''); }}
        >复制路径</button>
        <button className="btn btn--sm" onClick={() => { void client.restoreArchive(result.path ?? ''); onClose(); }}>
          基于档案恢复
        </button>
      </div>
      {!!result.slots?.length && (
        <p className="field__hint" style={{ marginTop: 12 }}>
          恢复前需重新授权：{result.slots.join('、')}（档案只记录凭据类别，不含原值）。
        </p>
      )}
    </Modal>
  );
}

