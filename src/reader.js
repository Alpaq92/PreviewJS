// Bootstrap for the read-only embed page (reader.html). A document arrives one
// of two ways:
//   1. ?src=<url>&name=<file>  — the iframe self-fetches same-origin (cookie-authed).
//   2. postMessage({ type:'readerjs:load', buffer, name, mime }) — the host (via
//      readerjs.js mount()) hands bytes in.
// `name`'s extension selects the renderer, so the host must pass it when the URL
// has no extension (e.g. /raw/123).
import { DocumentViewer } from './main.js'
import { setLang } from './i18n.js'

function boot() {
  const viewer = new DocumentViewer()
  window.viewer = viewer

  const params = new URLSearchParams(location.search)
  const src  = params.get('src')
  const name = params.get('name') ||
    (src ? decodeURIComponent(src.split('/').pop().split('?')[0] || 'document') : 'document')

  if (src) {
    // URL mode: self-fetch from the same origin (no JS on the host required).
    fetch(src, { credentials: 'same-origin' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer() })
      .then(buf => viewer.loadBytes(buf, name))
      .catch(err => viewer._showError(String(err?.message || err)))
    return
  }

  // Bytes mode: accept the document only from our own parent, same origin.
  window.addEventListener('message', e => {
    if (e.source !== window.parent || e.origin !== location.origin) return
    const m = e.data
    if (!m || typeof m !== 'object') return
    if (m.type === 'readerjs:load') viewer.loadBytes(m.buffer, m.name, m.mime)
    else if (m.type === 'readerjs:setLang' && m.lang) setLang(m.lang)
  })

  // Tell the host we're listening, so it can post the bytes.
  const parentOrigin = document.referrer ? new URL(document.referrer).origin : '*'
  try { window.parent.postMessage({ type: 'readerjs:ready' }, parentOrigin) } catch { /* opened standalone */ }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
