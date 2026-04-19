import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Initialize Tauri bridge BEFORE anything else — injects window.printerAPI etc.
import './services/tauriBridge'
import './index.css'
import './styles/receipt.css' // Receipt styles for printing
import App from './App.tsx'

// Global error handler to catch any uncaught errors and show them
window.onerror = (msg, src, line, col, err) => {
  document.body.innerHTML = `<pre style="padding:20px;color:red;font-size:14px;">
ERROR: ${msg}
Source: ${src}:${line}:${col}
${err?.stack || ''}
</pre>`;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
