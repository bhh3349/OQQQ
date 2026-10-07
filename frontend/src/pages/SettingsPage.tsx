/* ============================================================
   设置（设计文档 §04 / §16）
   行式面板 + 分隔节奏：模型与 Key、总结频率、外观、安全策略。
   全部改动即时生效（onChange 直接 updateSettings），无保存按钮。
   ============================================================ */
import { useState } from 'react';
import { client } from '../store/instance';
import { useSnapshot } from '../store/useOqqq';
import { EmptyState, Pill, Switch } from '../components/ui/Primitives';
import { Icon } from '../components/icons/Icons';
import type { OqqqSettings } from '../data/client';

type SettingsKey = keyof OqqqSettings;

/* 单值字段的统一写入入口：后续如需撤销/迁移，只改这里 */
function patch(key: SettingsKey, value: OqqqSettings[SettingsKey]) {
  void client.updateSettings({ [key]: value });
}

function FontScaleSlider({ value, onChange }: {
  value: number; onChange: (v: number) => void;
}) {
  return (
    <input
      type="range" min={0.9} max={1.15} step={0.01} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="st-range" aria-label="字号缩放"
    />
  );
}

export function SettingsPage() {
  const snapshot = useSnapshot();
  const { settings, conversations } = snapshot;

  const [showKey, setShowKey] = useState(false);
  const [summaryTarget, setSummaryTarget] = useState<string>(() => {
    const group = conversations.find(c => c.kind === 'group');
    return group ? group.id : conversations[0]?.id ?? '';
  });
  const [summoning, setSummoning] = useState(false);

  const groups = conversations.filter(c => c.kind === 'group');
  const hasGroup = groups.length > 0;

  const requestNow = async () => {
    if (!summaryTarget || summoning) return;
    setSummoning(true);
    try {
      await client.requestSummary(summaryTarget);
    } finally {
      setSummoning(false);
    }
  };

  return (
    <div className="st-page">
      <header className="st-head">
        <div>
          <h2 className="st-title">设置</h2>
          <p className="st-sub">改动即时生效，随时可回退；无需保存按钮。</p>
        </div>
      </header>

      <div className="st-body">
        {/* 模型与 Key */}
        <section className="st-group" aria-labelledby="st-model">
          <h3 id="st-model" className="st-group__title">模型与 Key</h3>

          <div className="st-row">
            <div className="st-row__text">
              <span className="st-row__name">默认模型</span>
              <span className="st-row__desc">新会话与总结任务默认使用的模型标识。</span>
            </div>
            <input
              className="input st-row__control" value={settings.defaultModel}
              onChange={e => patch('defaultModel', e.target.value)}
              aria-label="默认模型" spellCheck={false}
            />
          </div>

          <div className="st-row">
            <div className="st-row__text">
              <span className="st-row__name">API Key</span>
              <span className="st-row__desc">
                当前以掩码展示，供确认配置是否已生效。Key 只进入安全配置流，
                不写入日志、消息、档案或前端持久化。
              </span>
            </div>
            <div className="st-row__control st-key">
              <input
                className="input st-key__input" readOnly
                type={showKey ? 'text' : 'password'}
                value={settings.apiKeyMasked}
                aria-label={showKey ? 'API Key（明文）' : 'API Key（已遮罩）'}
              />
              <button
                type="button" className="iconbtn" tabIndex={0}
                aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                aria-pressed={showKey}
                onClick={() => setShowKey(v => !v)}
              >
                <Icon name={showKey ? 'eyeOff' : 'eye'} size={16} />
              </button>
            </div>
          </div>
        </section>

        {/* 总结频率 */}
        <section className="st-group" aria-labelledby="st-summary">
          <h3 id="st-summary" className="st-group__title">总结频率</h3>

          <div className="st-row">
            <div className="st-row__text">
              <span className="st-row__name">自动总结间隔</span>
              <span className="st-row__desc">
                每 N 条可见群发言生成阶段总结；工具事件、系统事件与旧总结不计数。
              </span>
            </div>
            <div className="st-row__control st-num">
              <input
                type="number" min={10} max={200} step={1}
                className="input st-num__input" value={settings.summaryEvery}
                onChange={e => {
                  const raw = Number(e.target.value);
                  if (Number.isFinite(raw)) patch('summaryEvery', Math.min(200, Math.max(10, Math.trunc(raw))));
                }}
                aria-label="每 N 条可见群发言生成阶段总结（10-200）"
              />
              <span className="st-num__suffix">条</span>
            </div>
          </div>

          <div className="st-row">
            <div className="st-row__text">
              <span className="st-row__name">立即总结当前会话</span>
              <span className="st-row__desc">选一个群聊立即生成阶段总结，不等计数达到阈值。</span>
            </div>
            <div className="st-row__control st-now">
              <select
                className="input st-now__select" value={summaryTarget}
                onChange={e => setSummaryTarget(e.target.value)}
                aria-label="选择要立即总结的群聊"
              >
                {hasGroup
                  ? groups.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))
                  : <option value="">暂无群聊</option>}
              </select>
              <button
                type="button" className="btn st-now__btn"
                onClick={() => void requestNow()}
                disabled={!summaryTarget || summoning}
              >
                {summoning ? '总结中…' : '立即总结'}
              </button>
            </div>
          </div>
        </section>

        {/* 外观 */}
        <section className="st-group" aria-labelledby="st-appearance">
          <h3 id="st-appearance" className="st-group__title">外观</h3>

          <div className="st-row">
            <div className="st-row__text">
              <span className="st-row__name">主题</span>
              <span className="st-row__desc">浅色或深色，即刻切换整个客户端。</span>
            </div>
            <div className="st-row__control st-theme" role="radiogroup" aria-label="主题">
              {(['light', 'dark'] as const).map(t => (
                <button
                  key={t} type="button" role="radio" aria-checked={settings.theme === t}
                  className={`st-theme__opt${settings.theme === t ? ' st-theme__opt--on' : ''}`}
                  onClick={() => patch('theme', t)}
                >
                  {t === 'light' ? '浅色' : '深色'}
                </button>
              ))}
            </div>
          </div>

          <div className="st-row">
            <div className="st-row__text">
              <span className="st-row__name">字号缩放</span>
              <span className="st-row__desc">在 0.90 到 1.15 之间微调全局正文字号，改动立即应用到界面。</span>
            </div>
            <div className="st-row__control st-scale">
              <FontScaleSlider
                value={settings.fontScale}
                onChange={v => {
                  patch('fontScale', v);
                  document.documentElement.style.setProperty('--fs-14', `${(14 * v).toFixed(2)}px`);
                }}
              />
              <span className="st-scale__value tnum">{settings.fontScale.toFixed(2)}×</span>
            </div>
          </div>
        </section>

        {/* 安全策略 */}
        <section className="st-group" aria-labelledby="st-safety">
          <h3 id="st-safety" className="st-group__title">安全策略</h3>

          <div className="st-row">
            <div className="st-row__text">
              <span className="st-row__name">危险操作需审批</span>
              <span className="st-row__desc">
                文件覆盖、删除或发版等操作先进入审批队列；关闭后操作立即执行并写入审计。
              </span>
            </div>
            <div className="st-row__control">
              <Switch
                checked={settings.requireApproval}
                onChange={v => patch('requireApproval', v)}
                label="危险操作需审批"
              />
            </div>
          </div>

          <div className="st-row">
            <div className="st-row__text">
              <span className="st-row__name">群公告同步为开发公约</span>
              <span className="st-row__desc">
                把群公告内容合并进会话的开发公约，成员产出按公约约束；关闭后公约只保留历史版本。
              </span>
            </div>
            <div className="st-row__control">
              <Switch
                checked={settings.syncAnnouncementAsCharter}
                onChange={v => patch('syncAnnouncementAsCharter', v)}
                label="群公告同步为开发公约"
              />
            </div>
          </div>
        </section>

        {!settings && (
          <EmptyState icon="info" title="设置不可用" hint="连接恢复后设置会重新加载。" />
        )}
      </div>

      <footer className="st-foot">
        <Pill tone="muted">配置边界</Pill>
        <span className="st-foot__text">
          后端未决项通过 Schema / Registry / Feature Flag 屏蔽，不影响界面结构。
        </span>
      </footer>
    </div>
  );
}
