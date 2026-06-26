import { BaseRenderer } from './base-renderer.js'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

export class PDFRenderer extends BaseRenderer {
  constructor() {
    super()
    this.pdfDoc    = null
    this._task     = null
    this._pageW    = 0
    this._pageH    = 0
    this._observer = null
    this.defaultScaleOption = 'page-height'  // fixed pages → fit one to the window height
  }

  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)

    this._task   = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    this.pdfDoc  = await this._task.promise
    this.numPages = this.pdfDoc.numPages

    const first  = await this.pdfDoc.getPage(1)
    const vp0    = first.getViewport({ scale: 1 })
    this._pageW  = vp0.width
    this._pageH  = vp0.height

    container.innerHTML = ''

    for (let i = 1; i <= this.numPages; i++) {
      await this._renderPage(i)
    }

    this._attachScrollObserver()
    // Await so the default-zoom re-render (page-height on open) doesn't run
    // concurrently with thumbnail rendering — pdf.js cancels page renders that
    // overlap. Guarded so a thumbnail failure can't abort opening the document.
    try { await this._buildThumbnails() } catch (e) { console.warn('[PDF] thumbnail build failed:', e) }
  }

  async _renderPage(pageNum) {
    const page     = await this.pdfDoc.getPage(pageNum)
    const viewport = page.getViewport({ scale: this.scale })

    const wrap   = document.createElement('div')
    wrap.className = 'pdf-page'
    wrap.dataset.page = pageNum

    const canvas       = document.createElement('canvas')
    canvas.width       = viewport.width
    canvas.height      = viewport.height

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise

    wrap.appendChild(canvas)
    this.container.appendChild(wrap)
  }

  async setScale(scale) {
    if (!this.pdfDoc) { this.scale = scale; return }
    this.scale = scale

    const wraps   = [...this.container.querySelectorAll('.pdf-page')]
    const current = this.viewer?.currentPage || 1

    for (let i = 0; i < this.numPages; i++) {
      const pageNum  = i + 1
      const page     = await this.pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvas   = wraps[i]?.querySelector('canvas')
      if (!canvas) continue
      canvas.width  = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    }

    // Restore scroll position
    this.scrollToPage(current)
  }

  _attachScrollObserver() {
    if (this._observer) this._observer.disconnect()

    const root = this.container.parentElement
    this._observer = new IntersectionObserver(entries => {
      let best = { ratio: 0, page: this.viewer?.currentPage || 1 }
      entries.forEach(e => {
        if (e.intersectionRatio > best.ratio) {
          best = { ratio: e.intersectionRatio, page: +e.target.dataset.page }
        }
      })
      if (best.ratio > 0 && this.viewer && best.page !== this.viewer.currentPage) {
        this.viewer.currentPage = best.page
        this.viewer.updatePageInfo()
        this._highlightThumb(best.page)
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1], root })

    this.container.querySelectorAll('.pdf-page').forEach(el => this._observer.observe(el))
  }

  async _buildThumbnails() {
    const box = document.getElementById('thumbsContent')
    if (!box) return
    box.innerHTML = ''

    for (let i = 1; i <= this.numPages; i++) {
      const page     = await this.pdfDoc.getPage(i)
      const viewport = page.getViewport({ scale: 0.18 })

      const canvas  = document.createElement('canvas')
      canvas.width  = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise

      const wrap  = document.createElement('div')
      wrap.className  = 'thumb'
      wrap.dataset.thumbPage = i
      wrap.title = `Page ${i}`

      const lbl        = document.createElement('div')
      lbl.className    = 'thumb-label'
      lbl.textContent  = i

      wrap.appendChild(canvas)
      wrap.appendChild(lbl)
      wrap.addEventListener('click', () => this.viewer?.goToPage(i))
      box.appendChild(wrap)
    }
  }

  _highlightThumb(pageNum) {
    document.querySelectorAll('.thumb').forEach(t => {
      t.classList.toggle('active', +t.dataset.thumbPage === pageNum)
    })
  }

  getPageWidth()  { return this._pageW }
  getPageHeight() { return this._pageH }

  async preparePrint() {
    const layer = document.getElementById('printLayer')
    layer.innerHTML = ''

    for (let i = 1; i <= this.numPages; i++) {
      const page     = await this.pdfDoc.getPage(i)
      const viewport = page.getViewport({ scale: 2.0 })

      const canvas  = document.createElement('canvas')
      canvas.width  = viewport.width
      canvas.height = viewport.height
      canvas.className = 'print-page'

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      layer.appendChild(canvas)
    }

    document.body.classList.add('pdf-printing')
  }

  cleanupAfterPrint() {
    document.body.classList.remove('pdf-printing')
    document.getElementById('printLayer').innerHTML = ''
  }

  scrollToPage(pageNum) {
    const el = this.container?.querySelector(`.pdf-page[data-page="${pageNum}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Plain-text of the PDF for the compare view — pulled from pdf.js's text
  // layer (no canvas render). Lines are split on pdf.js's hasEOL flag and on a
  // baseline (y) change, so reflowed runs land on the right line.
  // Returns an array of per-page text, so the compare view can diff page-by-page.
  async extractText(buffer) {
    const task = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    const doc = await task.promise
    const pages = []
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        const { items } = await (await doc.getPage(p)).getTextContent()
        const lines = []
        let line = '', lastY = null
        for (const it of items) {
          const y = it.transform?.[5]
          if (line && lastY != null && y != null && Math.abs(y - lastY) > 4) { lines.push(line); line = '' }
          line += it.str
          if (y != null) lastY = y
          if (it.hasEOL) { lines.push(line); line = ''; lastY = null }
        }
        if (line) lines.push(line)
        pages.push(lines.join('\n'))
      }
    } finally {
      await task.destroy()   // pdf.js 6: destroy the loading task, not the document proxy
    }
    return pages
  }

  destroy() {
    this._observer?.disconnect()
    this._task?.destroy()    // pdf.js 6: destroy the loading task, not the document proxy
    this.pdfDoc = null
    this._task = null
    super.destroy()
  }
}
