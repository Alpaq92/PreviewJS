import { BaseRenderer } from './base-renderer.js'
// Registers the <foliate-view> custom element. foliate-js (MIT) isn't published
// to npm, so it's pinned to a commit as a git dependency in package.json.
import 'foliate-js/view.js'

// Reflowable books are styled by injecting CSS into each section document.
// "Zoom" maps to font-size since EPUB/MOBI have no fixed page geometry.
const bookCSS = (scale) => `
  html { color-scheme: light dark; font-size: ${Math.round(100 * scale)}%; }
  p, li, blockquote, dd { line-height: 1.5; }
`

/**
 * Renders reflowable e-books — EPUB, MOBI and KF8/AZW3 — via foliate-js's
 * <foliate-view> paginator. Page turns and the page counter are driven by
 * foliate's `relocate` events (location.current / location.total).
 */
export class EPUBRenderer extends BaseRenderer {
  constructor() {
    super()
    this._view     = null
    this._total    = 1
    this._onResize = null
    this.defaultScaleOption = null  // reflowable: fills its frame, zoom = font size
  }

  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)
    container.innerHTML = ''

    const view = document.createElement('foliate-view')
    view.className = 'epub-view'
    container.appendChild(view)
    this._view = view
    this._sizeView()

    // foliate detects EPUB (zip magic) and MOBI/KF8 (magic bytes) from content,
    // so the blob name is only a hint; carry the real name through anyway.
    const name = viewer?.currentFileName || 'book.epub'
    await view.open(new File([buffer], name))

    // Resolve once the first page has been laid out so numPages is populated
    // before load() returns (main.js reads renderer.numPages right after).
    await new Promise(resolve => {
      let settled = false
      const done = () => { if (!settled) { settled = true; resolve() } }
      view.addEventListener('relocate', e => { this._onRelocate(e.detail); done() })
      view.renderer.setStyles?.(bookCSS(this.scale))
      Promise.resolve(view.renderer.next()).catch(done)
      setTimeout(done, 4000) // safety net for malformed books
    })

    this._onResize = () => this._sizeView()
    window.addEventListener('resize', this._onResize)
  }

  _onRelocate(detail) {
    const loc = detail?.location
    if (!loc) return
    this._total   = loc.total || 1
    this.numPages = this._total
    if (this.viewer) {
      this.viewer.numPages    = this._total
      this.viewer.currentPage = loc.current || 1
      this.viewer.updatePageInfo()
    }
  }

  _sizeView() {
    const vc = document.getElementById('viewerContainer')
    if (!vc || !this._view) return
    // viewerContainer has 20px padding on each side
    this._view.style.width  = `${Math.max(300, vc.clientWidth  - 40)}px`
    this._view.style.height = `${Math.max(300, vc.clientHeight - 40)}px`
  }

  /* ── Navigation ──────────────────────────────────────────────────────── */
  scrollToPage(n) {
    const cur = this.viewer?.currentPage || 1
    if (!this._view || n === cur) return
    if (n === cur + 1)      this._view.next()
    else if (n === cur - 1) this._view.prev()
    else if (this._total > 1) this._view.goToFraction((n - 1) / (this._total - 1))
  }

  /* ── Zoom → font size (reflow) ───────────────────────────────────────── */
  setScale(scale) {
    this.scale = scale
    this._view?.renderer?.setStyles?.(bookCSS(scale))
  }

  // Reflowable: no meaningful fixed page geometry for page-fit/width.
  getPageWidth()  { return null }
  getPageHeight() { return null }

  destroy() {
    if (this._onResize) window.removeEventListener('resize', this._onResize)
    this._onResize = null
    this._view?.close?.()
    this._view?.remove()
    this._view = null
    super.destroy()
  }
}
