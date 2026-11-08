import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { MobileApp } from './App.tsx'

document.documentElement.classList.add('ng-mobile-pwa')
document.body.classList.add('ng-mobile-pwa')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw-mobile.js`).catch(() => {
      /* optional offline shell */
    })
  })
}
