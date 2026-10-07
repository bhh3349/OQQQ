/* ============================================================
   跨页跳转桥：联系人页「打开聊天」→ 消息页定位会话。
   一处订阅（App），一处派发（任意页面），不引入路由库。
   ============================================================ */
import type { PageId } from '../components/shell/NavigationRail';

export type NavIntent = { page: PageId; conversationId?: string };

let handler: ((n: NavIntent) => void) | null = null;

export function onNav(fn: (n: NavIntent) => void): () => void {
  handler = fn;
  return () => { if (handler === fn) handler = null; };
}

export function navigate(n: NavIntent): void {
  handler?.(n);
}
