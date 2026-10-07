import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
/* 样式层顺序：tokens（变量）→ base（重置/框架）→ ui（通用件）
   → shell（外壳）→ chat（消息页）→ capability/misc（其余页） */
import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/shell.css'
import './styles/chat.css'
import './styles/capability.css'
import './styles/misc.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
