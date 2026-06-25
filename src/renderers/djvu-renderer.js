import { BaseRenderer } from './base-renderer.js'

const MAX_RENDER_W = 2000   // cap page render resolution (crisp at fit + moderate zoom)
const THUMB_W = 200

/**
 * Renders DjVu documents (.djvu / .djv) with DejaView (MIT) — a pure-JS DjVu
 * decoder that runs in a Web Worker. Pages are rendered lazily on scroll (DjVu
 * files are typically large scanned books) and cleared when far off-screen.
 */
export class DjVuRenderer extends BaseRenderer {
  constructor() {
    super()
    this._worker  = null
    this._reqId   = 0
    this._pending = new Map()
    this._infos   = []
    this._pageW   = 800
    this._pageH   = 1000
    this._gen     = 0
    this._renderObs = null
    this._pageObs   = null
    this.defaultScaleOption = 'page-height'
    this.buildsThumbnailsAsync = true
  }

  _call(type, params) {
    return new Promise((resolve, reject) => {
      const id = ++this._reqId
      this._pending.set(id, { resolve, reject })
      this._worker.postMessage({ id, type, ...params })
    })
  }

  _logical(info) {
    const dpi = info?.dpi || 300
    return {
      w: Math.max(1, Math.round((info?.width  || 800)  * 96 / dpi)),
      h: Math.max(1, Math.round((info?.height || 1000) * 96 / dpi)),
    }
  }

  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)
    const gen = ++this._gen

    // Inline new URL(...) so Vite emits the dejaview worker as its own chunk.
    this._worker = new Worker(
      new URL('../../submodules/dejaview/src/worker.js', import.meta.url),
      { type: 'module' })
    this._worker.onmessage = (e) => {
      const { id, error } = e.data
      const p = this._pending.get(id)
      if (!p) return
      this._pending.delete(id)
      error ? p.reject(new Error(error)) : p.resolve(e.data)
    }

    const meta = await this._call('open', { buffer })
    if (gen !== this._gen) return
    this.numPages = meta.pageCount || 1
    this._infos   = meta.infos || []
    const l0 = this._logical(this._infos[0])
    this._pageW = l0.w
    this._pageH = l0.h

    container.innerHTML = ''
    for (let i = 0; i < this.numPages; i++) {
      const lg = this._logical(this._infos[i])
      const wrap = document.createElement('div')
      wrap.className = 'djvu-page'
      wrap.dataset.page = i + 1
      wrap.dataset.lw = lg.w
      wrap.dataset.lh = lg.h
      container.appendChild(wrap)
    }

    this.setScale(this.scale)   // size the placeholders
    this._attachObservers()
    this._renderWindow(0)        // first pages right away
    this._buildThumbnails(gen)
  }

  // Render a small window around a page proactively (navigation + initial view),
  // so rendering never depends solely on the scroll IntersectionObserver.
  _renderWindow(center) {
    for (let i = center - 1; i <= center + 1; i++) {
      if (i >= 0 && i < this.numPages) this._renderPage(i)
    }
  }

  /* ── Lazy rendering ──────────────────────────────────────────────────── */
  _attachObservers() {
    const root = this.container.parentElement
    // render pages near the viewport; drop their canvas when they leave (bounds memory)
    this._renderObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const i = +e.target.dataset.page - 1
        if (e.isIntersecting) this._renderPage(i)
        else this._clearPage(e.target)
      })
    }, { root, rootMargin: '150% 0px', threshold: 0 })

    // track the current page (most visible)
    this._pageObs = new IntersectionObserver(entries => {
      let best = { ratio: 0, page: this.viewer?.currentPage || 1 }
      entries.forEach(e => {
        if (e.intersectionRatio > best.ratio) best = { ratio: e.intersectionRatio, page: +e.target.dataset.page }
      })
      if (best.ratio > 0 && this.viewer && best.page !== this.viewer.currentPage) {
        this.viewer.currentPage = best.page
        this.viewer.updatePageInfo()
        this._highlightThumb(best.page)
      }
    }, { root, threshold: [0, 0.25, 0.5, 0.75, 1] })

    this.container.querySelectorAll('.djvu-page').forEach(el => {
      this._renderObs.observe(el)
      this._pageObs.observe(el)
    })
  }

  _subsample(info) {
    const w = info?.width || 800
    return Math.max(1, Math.round(w / Math.min(w, MAX_RENDER_W)))
  }

  async _renderPage(i) {
    const wrap = this.container?.querySelector(`.djvu-page[data-page="${i + 1}"]`)
    if (!wrap || wrap.dataset.rendered) return
    wrap.dataset.rendered = '1'
    const gen = this._gen
    try {
      const res = await this._call('render', { index: i, subsample: this._subsample(this._infos[i]) })
      if (gen !== this._gen || !this._worker) return
      const canvas = document.createElement('canvas')
      canvas.width = res.width
      canvas.height = res.height
      canvas.getContext('2d').putImageData(new ImageData(res.rgba, res.width, res.height), 0, 0)
      wrap.innerHTML = ''
      wrap.appendChild(canvas)
    } catch {
      wrap.dataset.rendered = ''   // allow a later retry
    }
  }

  _clearPage(wrap) {
    if (wrap.dataset.rendered) {
      wrap.innerHTML = ''
      wrap.dataset.rendered = ''
    }
  }

  /* ── Zoom (CSS — placeholders + canvases scale together) ─────────────── */
  setScale(scale) {
    this.scale = scale
    this.container?.querySelectorAll('.djvu-page').forEach(el => {
      el.style.width  = `${Math.round((+el.dataset.lw || this._pageW) * scale)}px`
      el.style.height = `${Math.round((+el.dataset.lh || this._pageH) * scale)}px`
    })
  }

  getPageWidth()  { return this._pageW }
  getPageHeight() { return this._pageH }

  scrollToPage(pageNum) {
    const el = this.container?.querySelector(`.djvu-page[data-page="${pageNum}"]`)
    if (!el) return
    this._renderWindow(pageNum - 1)   // render target (+ neighbours) regardless of the observer
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /* ── Thumbnails ──────────────────────────────────────────────────────── */
  async _buildThumbnails(gen) {
    const box = document.getElementById('thumbsContent')
    if (!box) return
    for (let i = 0; i < this.numPages; i++) {
      const info = this._infos[i]
      const sub = Math.max(1, Math.round((info?.width || 800) / THUMB_W))
      let res
      try { res = await this._call('render', { index: i, subsample: sub }) } catch { continue }
      if (gen !== this._gen || !this._worker) return
      const canvas = document.createElement('canvas')
      canvas.width = res.width
      canvas.height = res.height
      canvas.getContext('2d').putImageData(new ImageData(res.rgba, res.width, res.height), 0, 0)
      const img = document.createElement('img')
      img.src = canvas.toDataURL('image/png')
      const wrap = document.createElement('div')
      wrap.className = 'thumb'
      wrap.dataset.thumbPage = i + 1
      const lbl = document.createElement('div')
      lbl.className = 'thumb-label'
      lbl.textContent = i + 1
      wrap.append(img, lbl)
      wrap.addEventListener('click', () => this.viewer?.goToPage(i + 1))
      box.appendChild(wrap)
    }
    this._highlightThumb(this.viewer?.currentPage || 1)
  }

  _highlightThumb(pageNum) {
    document.querySelectorAll('#thumbsContent .thumb').forEach(t => {
      t.classList.toggle('active', +t.dataset.thumbPage === pageNum)
    })
  }

  destroy() {
    this._gen++
    this._renderObs?.disconnect()
    this._pageObs?.disconnect()
    this._renderObs = this._pageObs = null
    this._pending.clear()
    this._worker?.terminate()
    this._worker = null
    super.destroy()
  }
}
