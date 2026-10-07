/* ============================================================
   标题栏 —— 本项目的签名动作
   「标题栏即状态栏」：后端连接态、引擎健康度、当前模型压进蓝条右侧，
   替代 QQ 的天气位。未连接时整条降灰，多引擎这件事在窗口第一像素可见。
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icons';
import { useClient, useSnapshot } from '../../store/useOqqq';
import type { ConnectionState } from '../../types/model';

const LINK_TEXT: Record<ConnectionState, string> = {
  online: '已连接',
  connecting: '连接中',
  reconnecting: '重连中',
  offline: '已离线',
  backend_down: '后端不可用',
};
const LINK_TONE: Record<ConnectionState, 'ok' | 'warn' | 'bad'> = {
  online: 'ok', connecting: 'warn', reconnecting: 'warn',
  offline: 'bad', backend_down: 'bad',
};

export function TitleBar() {
  const s = useSnapshot();
  const client = useClient();
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

  const healthy = s.engines.filter(e => e.health === 'healthy').length;
  const installed = s.engines.filter(e => e.installState.status === 'installed').length;
  const degraded = s.engines.filter(e => e.health === 'degraded' || e.health === 'down').length;
  const engineTone = degraded ? (s.engines.some(e => e.health === 'down') ? 'bad' : 'warn') : 'ok';

  return (
    <header className="titlebar" data-link={s.connection}>
      <span className="titlebar__mark">OQQQ</span>

      <div className="titlebar__me">
        <span className="titlebar__avatar" aria-hidden>Bo</span>
        <span className="titlebar__who">
          <span className="titlebar__name">Bo</span>
          <span className="titlebar__sign">用群聊的方式写代码</span>
        </span>
      </div>

      <span className="titlebar__spacer" />

      <div className="linkstats">
        <div className="linkstat-wrap" ref={menuRef}>
          <button
            type="button"
            className="linkstat linkstat--button"
            data-tone={LINK_TONE[s.connection]}
            onClick={() => {
              if (s.connection === 'online') { setMenu(v => !v); }
              else void client.reconnect();
            }}
            aria-haspopup="menu"
            aria-expanded={menu}
          >
            <i className="linkstat__dot" aria-hidden />
            <span className="linkstat__label">后端 {LINK_TEXT[s.connection]}</span>
          </button>
          {menu && (
            <div className="linkstat-menu" role="menu">
              <p className="linkstat-menu__head">连接诊断（演示故障态）</p>
              <button role="menuitem" onClick={() => { client.simulateFailure('reconnecting'); setMenu(false); }}>
                模拟重连中
              </button>
              <button role="menuitem" onClick={() => { client.simulateFailure('offline'); setMenu(false); }}>
                模拟离线
              </button>
              <button role="menuitem" onClick={() => { client.simulateFailure('backend_down', 'OQQQ Core 未启动（127.0.0.1:18791 无响应）'); setMenu(false); }}>
                模拟后端不可用
              </button>
              <button role="menuitem" onClick={() => { void client.reconnect(); setMenu(false); }}>
                恢复连接
              </button>
            </div>
          )}
        </div>

        <span className="linkstat" data-tone={engineTone} title={`${installed} 个引擎已安装，${healthy} 个健康`}>
          <i className="linkstat__dot" aria-hidden />
          <span className="linkstat__label tnum">引擎 {healthy}/{installed}</span>
        </span>

        <span className="linkstat" title="当前默认模型，可在设置中更改">
          <span className="linkstat__label">{s.settings.defaultModel}</span>
        </span>
      </div>

      <div className="wctl">
        <button type="button" aria-label="最小化"><Icon name="minimize" size={16} /></button>
        <button type="button" aria-label="最大化"><Icon name="maximize" size={14} /></button>
        <button type="button" data-role="close" aria-label="关闭"><Icon name="close" size={15} /></button>
      </div>
    </header>
  );
}
