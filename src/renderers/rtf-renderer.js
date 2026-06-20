import { BaseRenderer } from './base-renderer.js'

const CDN_JQUERY = 'https://code.jquery.com/jquery-3.7.1.min.js'
const SCRIPTS = [
  CDN_JQUERY,
  '/rtfjs/EMFJS.bundle.min.js',
  '/rtfjs/WMFJS.bundle.min.js',
  '/rtfjs/RTFJS.bundle.min.js',
]

let _loaded = false

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.onload  = resolve
    s.onerror = () => reject(new Error(`Failed to load: ${src}`))
    document.head.appendChild(s)
  })
}

async function ensureRTFJS() {
  if (_loaded && window.RTFJS) return
  // Load sequentially — each bundle depends on the previous one's global
  for (const src of SCRIPTS) await loadScript(src)
  if (!window.RTFJS) throw new Error('RTFJS global not set after script load')
  _loaded = true
}

export class RTFRenderer extends BaseRenderer {
  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)

    await ensureRTFJS()

    // RTFJS.Document expects a string or ArrayBuffer
    const doc = new window.RTFJS.Document(buffer, {})
    const elements = await doc.render()

    container.innerHTML = ''
    const page = document.createElement('div')
    page.className = 'doc-page'
    page.dataset.page = 1
    elements.forEach(el => page.appendChild(el))
    container.appendChild(page)

    this.numPages = 1
  }
}
