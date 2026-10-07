import { useEffect, useState } from 'react';
import { TitleBar } from './components/shell/TitleBar';
import { NavigationRail, type PageId } from './components/shell/NavigationRail';
import { ConnectionBanner, Toaster } from './components/shell/Toaster';
import { MessagesPage } from './pages/MessagesPage';
import { ContactsPage } from './pages/ContactsPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { CapabilityPage } from './pages/CapabilityPage';
import { MarketPage } from './pages/MarketPage';
import { SettingsPage } from './pages/SettingsPage';
import { onNav } from './store/nav';

export default function App() {
  const initial = (location.hash.slice(1) || 'messages') as PageId;
  const [page, setPage] = useState<PageId>(initial);
  const [focusCid, setFocusCid] = useState<string | undefined>();

  /* 联系人页「打开聊天」等跨页意图 + hash 深链 */
  useEffect(() => onNav(n => {
    setPage(n.page);
    location.hash = n.page;
    if (n.conversationId) setFocusCid(n.conversationId);
  }), []);
  useEffect(() => {
    const onHash = () => setPage(((location.hash.slice(1) || 'messages') as PageId));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="window-frame">
      <div className="app">
        <TitleBar />
        <ConnectionBanner />
        <div className="app__body">
          <NavigationRail page={page} onPage={setPage} />
          <main className="pagehost" key={page}>
            {page === 'messages' && <MessagesPage focusConversationId={focusCid} />}
            {page === 'contacts' && <ContactsPage />}
            {page === 'workspace' && <WorkspacePage />}
            {page === 'skills' && <CapabilityPage kind="skill" />}
            {page === 'connectors' && <CapabilityPage kind="connector" />}
            {page === 'market' && <MarketPage />}
            {page === 'settings' && <SettingsPage />}
          </main>
        </div>
        <Toaster />
      </div>
    </div>
  );
}
