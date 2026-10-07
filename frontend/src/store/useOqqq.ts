/* ============================================================
   React 绑定层
   组件只通过这里取数与发意图，不接触 client 内部，也不碰传输层。
   ============================================================ */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { OqqqSnapshot } from '../data/client';
import type { OqqqEvent } from '../data/events';
import { client } from './instance';

export function useSnapshot(): OqqqSnapshot {
  return useSyncExternalStore(
    cb => client.subscribeChanges(cb),
    () => client.snapshot(),
    () => client.snapshot(),
  );
}

/** 订阅业务事件（toast / 连接态等瞬时反馈，不进快照） */
export function useOqqqEvent(handler: (e: OqqqEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => client.subscribe(e => ref.current(e)), []);
}

export function useClient() {
  return useMemo(() => ({
    send: (cid: string, text: string, mentions?: string[]) => client.send(cid, text, mentions),
    stop: (cid: string) => client.stop(cid),
    retry: (mid: string) => client.retry(mid),
    editResend: (mid: string, text: string) => client.editResend(mid, text),
    saveDraft: (cid: string, text: string) => client.saveDraft(cid, text),
    loadMessages: (cid: string) => client.loadMessages(cid),
    resolveApproval: (mid: string, approved: boolean) => client.resolveApproval(mid, approved),
    createDirect: (peer: string) => client.createDirect(peer),
    createGroup: (input: Parameters<typeof client.createGroup>[0]) => client.createGroup(input),
    setPinned: (cid: string, pinned: boolean) => client.setPinned(cid, pinned),
    setMuted: (cid: string, muted: boolean) => client.setMuted(cid, muted),
    setWorkspacePath: (cid: string, path: string) => client.setWorkspacePath(cid, path),
    installEngine: (id: string) => client.installEngine(id),
    updateEngine: (id: string) => client.updateEngine(id),
    uninstallEngine: (id: string) => client.uninstallEngine(id),
    addContactFromEngine: (id: string) => client.addContactFromEngine(id),
    toggleCapability: (id: string, on: boolean) => client.toggleCapability(id, on),
    bindCapability: (id: string, agents: string[]) => client.bindCapability(id, agents),
    searchMarket: (q: string, sort: Parameters<typeof client.searchMarket>[1]) => client.searchMarket(q, sort),
    getPluginPermissions: (t: string) => client.getPluginPermissions(t),
    installPlugin: (t: string, confirmed: string[]) => client.installPlugin(t, confirmed),
    updateAnnouncement: (cid: string, text: string) => client.updateAnnouncement(cid, text),
    pmConfirm: (cid: string) => client.pmConfirm(cid),
    pmProposeTeam: (cid: string) => client.pmProposeTeam(cid),
    pmFormTeam: (cid: string, spec: Parameters<typeof client.pmFormTeam>[1]) => client.pmFormTeam(cid, spec),
    requestSummary: (cid: string) => client.requestSummary(cid),
    archiveProject: (cid: string, copy: boolean) => client.archiveProject(cid, copy),
    restoreArchive: (path: string) => client.restoreArchive(path),
    updateSettings: (patch: Partial<OqqqSnapshot['settings']>) => client.updateSettings(patch),
    reconnect: () => client.reconnect(),
    simulateFailure: (s: Parameters<typeof client.simulateFailure>[0], d?: string) => client.simulateFailure(s, d),
  }), []);
}
