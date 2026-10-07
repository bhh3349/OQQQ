/* ============================================================
   统一 SVG 图标集（设计文档 §14：图标来自同一 SVG 集，避免混搭）
   规格：24×24 网格 · 1.6 描边 · round 端点 · currentColor · 无填充
   禁用 emoji 充当功能图标。
   ============================================================ */
import type { JSX, SVGProps } from 'react';

export type IconName =
  /* 导航 7 入口 */
  | 'message' | 'contacts' | 'workspace' | 'skills' | 'connectors' | 'market' | 'settings'
  /* 会话与输入 */
  | 'search' | 'plus' | 'send' | 'stop' | 'retry' | 'attach' | 'emoji' | 'screenshot'
  | 'image' | 'video' | 'mic' | 'history' | 'at' | 'pin' | 'bell' | 'bellOff'
  /* 窗口与通用 */
  | 'minimize' | 'maximize' | 'close' | 'more' | 'phone' | 'screen' | 'chevronDown'
  | 'chevronRight' | 'chevronLeft' | 'check' | 'warning' | 'error' | 'info'
  | 'file' | 'folder' | 'link' | 'external' | 'user' | 'shield' | 'key'
  | 'download' | 'refresh' | 'trash' | 'sparkle' | 'terminal' | 'clock' | 'eye' | 'eyeOff'
  /* 页面级补充 */
  | 'archive' | 'panel' | 'engine' | 'star' | 'edit';

type P = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

const PATHS: Record<IconName, JSX.Element> = {
  message: <path d="M4 5.5h16v11H12l-4.5 3.2v-3.2H4z" />,
  contacts: <><circle cx="9.5" cy="8" r="3.4" /><path d="M3.6 19.4c.4-3.2 2.9-5 5.9-5s5.5 1.8 5.9 5" /><path d="M16.4 5.2a3 3 0 0 1 0 5.7M17.6 14.8c2 .5 3.1 2.2 3.3 4.6" /></>,
  workspace: <path d="M3.5 6.5a2 2 0 0 1 2-2h3.6l1.9 2.2h7.5a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  skills: <path d="M14.6 4.4a4.2 4.2 0 0 0 5.6 5.6L20.5 12l-8.5 8.5-6-6L14.5 6zM6.5 15.5 3.5 20.5" />,
  connectors: <><path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0z" /><path d="M12 16v5" /></>,
  market: <path d="M4 4h7v3.2a2.8 2.8 0 1 1 5.6 0V4h3.2v7h-3.2a2.8 2.8 0 1 0 0 5.6H20v3.4H4z" />,
  settings: <><circle cx="12" cy="12" r="3.1" /><path d="M12 2.8v2.6M12 18.6v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M2.8 12h2.6M18.6 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.2" /><path d="M15.4 15.4 20 20" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  send: <path d="M4.6 11.4 19.6 4.6l-6.8 15-2.2-6z" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="1.6" />,
  retry: <><path d="M20 6.5v5h-5" /><path d="M19.4 11.5A7.6 7.6 0 1 0 12 19.6a7.6 7.6 0 0 0 6.7-4" /></>,
  attach: <path d="M20 11.5 12.4 19a4.2 4.2 0 0 1-6-6l7.9-7.8a2.8 2.8 0 0 1 4 4l-8 7.9a1.4 1.4 0 0 1-2-2l7.4-7.4" />,
  emoji: <><circle cx="12" cy="12" r="8.4" /><path d="M8.8 14.2a4 4 0 0 0 6.4 0" /><path d="M9.2 9.8h.01M14.8 9.8h.01" /></>,
  screenshot: <><path d="M4 8.5V5.6a1.6 1.6 0 0 1 1.6-1.6H8.5M15.5 4h2.9A1.6 1.6 0 0 1 20 5.6v2.9M20 15.5v2.9a1.6 1.6 0 0 1-1.6 1.6h-2.9M8.5 20H5.6A1.6 1.6 0 0 1 4 18.4v-2.9" /></>,
  image: <><rect x="3.6" y="5.4" width="16.8" height="13.2" rx="2" /><circle cx="9" cy="10.4" r="1.7" /><path d="m4.6 17.4 4.8-4.6 3.6 3.4 2.8-2.4 3.8 3.6" /></>,
  video: <><rect x="3" y="6.6" width="12.6" height="10.8" rx="2" /><path d="m15.6 11.2 5.4-3v7.6l-5.4-3z" /></>,
  mic: <><rect x="9.4" y="3.2" width="5.2" height="10" rx="2.6" /><path d="M5.8 11.6a6.2 6.2 0 0 0 12.4 0M12 17.8V21" /></>,
  history: <><circle cx="12" cy="12" r="8.4" /><path d="M12 7.4V12l3.4 2" /></>,
  at: <><circle cx="12" cy="12" r="3.6" /><path d="M15.6 8.4v4.4a2.8 2.8 0 0 0 5.6 0V12a9.2 9.2 0 1 0-3.6 7.3" /></>,
  pin: <path d="M14.4 3.6 20.4 9.6l-3 1-2.4 4.6.6 4.2-4-4-4.6 4.6-.8-.8 4.6-4.6-4-4 4.2.6L15 6.6z" />,
  bell: <><path d="M6.6 16.4V11a5.4 5.4 0 0 1 10.8 0v5.4l1.4 2H5.2z" /><path d="M10.2 21a2 2 0 0 0 3.6 0" /></>,
  bellOff: <><path d="M6.6 16.4V11a5.4 5.4 0 0 1 7.2-5.1M17.4 11v5.4l1.4 2H8.2" /><path d="M4 4l16 16" /></>,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5" y="5" width="14" height="14" rx="1.4" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  phone: <path d="M6.2 4.4h3l1.4 3.6-1.9 1.5a10.6 10.6 0 0 0 5 5l1.5-1.9 3.6 1.4v3a1.6 1.6 0 0 1-1.8 1.6C11.4 18.4 5.8 12.8 4.6 6.2a1.6 1.6 0 0 1 1.6-1.8z" />,
  screen: <><rect x="3.4" y="4.6" width="17.2" height="11.6" rx="1.8" /><path d="M9 20h6M12 16.2V20" /></>,
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  chevronRight: <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />,
  chevronLeft: <path d="M14.5 6.5 9 12l5.5 5.5" />,
  check: <path d="m5 12.8 4.6 4.4L19 6.4" />,
  warning: <><path d="M12 4 21 19.6H3z" /><path d="M12 9.6v4.8M12 16.8h.01" /></>,
  error: <><circle cx="12" cy="12" r="8.4" /><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" /></>,
  info: <><circle cx="12" cy="12" r="8.4" /><path d="M12 11v5.4M12 7.8h.01" /></>,
  file: <><path d="M6 3.6h7.4L18.6 9v11.4H6z" /><path d="M13.2 3.8V9H18.4" /></>,
  folder: <path d="M3.6 6.4a1.8 1.8 0 0 1 1.8-1.8h3.4l1.8 2.2h7.4a1.8 1.8 0 0 1 1.8 1.8v8.8a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8z" />,
  link: <path d="M10.4 13.6a3.6 3.6 0 0 0 5.2 0l2.8-2.8a3.7 3.7 0 0 0-5.2-5.2l-1.4 1.4M13.6 10.4a3.6 3.6 0 0 0-5.2 0l-2.8 2.8a3.7 3.7 0 0 0 5.2 5.2l1.4-1.4" />,
  external: <><path d="M14 4.6h5.4V10" /><path d="M19.4 4.6 11.6 12.4M18 14v4.6a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 18.6V7.4A1.4 1.4 0 0 1 5.4 6H10" /></>,
  user: <><circle cx="12" cy="8.2" r="3.8" /><path d="M4.8 20c.5-3.9 3.5-6 7.2-6s6.7 2.1 7.2 6" /></>,
  shield: <path d="M12 3.6 19.4 6v6c0 4.2-3 7.2-7.4 8.4C7.6 19.2 4.6 16.2 4.6 12V6z" />,
  key: <><circle cx="8" cy="12" r="3.6" /><path d="M11.6 12H20l-1.6 2.4M16.6 12v3" /></>,
  download: <path d="M12 4v10.6M7.8 10.8 12 15l4.2-4.2M4.6 19.4h14.8" />,
  refresh: <><path d="M20 5.6v4.8h-4.8" /><path d="M19.6 10.4A8 8 0 1 0 12 20a8 8 0 0 0 7.4-4.6" /></>,
  trash: <><path d="M4.6 6.8h14.8M9.6 6.8V4.4h4.8v2.4" /><path d="M6.6 6.8 7.6 20h8.8l1-13.2M10.4 10.6v6M13.6 10.6v6" /></>,
  archive: <><path d="M3.5 4.2h17v4h-17z" /><path d="M5 8.2V19a1.6 1.6 0 0 0 1.6 1.6h10.8A1.6 1.6 0 0 0 19 19V8.2" /><path d="M10 12h4" /></>,
  panel: <><path d="M4 4.6h16v14.8H4z" /><path d="M15 4.6v14.8" /></>,
  engine: <><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3" /><circle cx="12" cy="12" r="3.4" /><path d="M12 4.2v2M12 17.8v2M4.2 12h2M17.8 12h2" /></>,
  star: <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />,
  edit: <><path d="M4.6 19.4h4L19 9a2.5 2.5 0 0 0-3.6-3.5L5 15.8z" /><path d="M14 6.8 17.2 10" /></>,
  sparkle: <path d="m12 3.6 1.9 5.1 5.1 1.9-5.1 1.9L12 17.6l-1.9-5.1L5 10.6l5.1-1.9zM18.4 16.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />,
  terminal: <><rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2" /><path d="m7.4 9.6 3 2.8-3 2.8M12.8 15.6h4" /></>,
  clock: <><circle cx="12" cy="12" r="8.4" /><path d="M12 7.2V12l3.4 2.2" /></>,
  eye: <><path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  eyeOff: <><path d="M4 4l16 16" /><path d="M9.6 6.8A9.6 9.6 0 0 1 12 6.4c6 0 9.4 5.6 9.4 5.6a15 15 0 0 1-2.6 3.2M6.4 8.6A15.4 15.4 0 0 0 2.6 12S6 17.6 12 17.6c1.1 0 2-.2 2.9-.5" /></>,
};

export function Icon({ name, size = 20, ...rest }: P) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={rest['aria-label'] ? undefined : true}
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
