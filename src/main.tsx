import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { captureInvite } from './lib/invite'
import { startScheme } from './lib/scheme'
import { startAutoUpdate } from './lib/update'

captureInvite()
startScheme()
startAutoUpdate()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
