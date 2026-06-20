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
    this._pageW    = 0
    this._pageH    = 0
    this._observer = null
  }

  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)

    const task   = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    this.pdfDoc  = await task.promise
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
    this._buildThumbnails()
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

  destroy() {
    this._observer?.disconnect()
    this.pdfDoc?.destroy()
    this.pdfDoc = null
    super.destroy()
  }
}
