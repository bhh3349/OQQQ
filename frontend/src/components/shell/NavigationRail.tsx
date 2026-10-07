/* ============================================================
   导航栏 —— 最左固定 7 个入口，一个入口只承担一种一级功能（文档 §04）
   顺序固定；设置贴底；收窄时保留图标栏，不折叠为汉堡菜单。
   ============================================================ */
import { Icon, type IconName } from '../icons/Icons';
import { Tooltip } from '../ui/Primitives';
import { useSnapshot } from '../../store/useOqqq';

export type PageId =
  | 'messages' | 'contacts' | 'workspace' | 'skills' | 'connectors' | 'market' | 'settings';

export const NAV: { id: PageId; label: string; icon: IconName }[] = [
  { id: 'messages', label: '消息', icon: 'message' },
  { id: 'contacts', label: '联系人', icon: 'contacts' },
  { id: 'workspace', label: '工作区', icon: 'workspace' },
  { id: 'skills', label: '技能', icon: 'skills' },
  { id: 'connectors', label: '连接器', icon: 'connectors' },
  { id: 'market', label: '插件广场第三方', icon: 'market' },
];

export function NavigationRail({
  page, onPage,
}: { page: PageId; onPage: (p: PageId) => void }) {
  const s = useSnapshot();
  const unread = s.conversations.reduce((n, c) => n + (c.muted ? 0 : c.unreadCount), 0);
  const updatable = s.engines.some(
    e => e.installState.status === 'installed' && e.installState.updateAvailable,
  );

  return (
    <nav className="rail" aria-label="主导航">
      {NAV.map(item => (
        <Tooltip key={item.id} label={item.label}>
          <button
            type="button"
            className="rail__btn"
            aria-current={page === item.id ? 'page' : undefined}
            onClick={() => onPage(item.id)}
          >
            <Icon name={item.icon} size={22} />
            {item.id === 'messages' && unread > 0 && (
              <span className="rail__badge tnum" aria-label={`${unread} 条未读`}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
            {item.id === 'contacts' && updatable && (
              <span className="rail__dot" aria-label="有可用更新" />
            )}
          </button>
        </Tooltip>
      ))}

      <span className="rail__spacer" />

      <Tooltip label="设置">
        <button
          type="button"
          className="rail__btn"
          aria-current={page === 'settings' ? 'page' : undefined}
          onClick={() => onPage('settings')}
        >
          <Icon name="settings" size={22} />
        </button>
      </Tooltip>
    </nav>
  );
}
