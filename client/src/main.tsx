import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Note: no StrictMode — the Yjs websocket session is a module-level singleton
// and StrictMode's double-mount would tear it down in dev.
createRoot(document.getElementById('root')!).render(<App />)
