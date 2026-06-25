import { BaseRenderer } from './base-renderer.js'

const EMU_PER_PX = 9525  // 914400 EMU/inch ÷ 96 px/inch
const THUMB_W = 320      // rendered thumbnail width (CSS scales it down in the sidebar)

/**
 * Renders PowerPoint (.pptx) presentations with PptxViewJS (MIT), one slide at a
 * time onto an HTML5 canvas. PptxViewJS paints the slide into the canvas's
 * current size, so the main view pins the canvas to native pixels (from
 * presentation.slideSize, EMU→px) and scales the wrapper via CSS zoom, while
 * slide thumbnails are rendered straight into small canvases. The toolbar's page
 * navigation drives slide changes. (Charts use Chart.js.)
 */
export class PPTXRenderer extends BaseRenderer {
  constructor() {
    super()
    this._view   = null
    this._wrap   = null
    this._canvas = null
    this._idx    = 0
    this._slideW = 960
    this._slideH = 720
    this._gen    = 0      // bumped on (re)load/destroy to cancel stale thumbnail loops
    this.defaultScaleOption = 'page-fit'  // show the whole slide on open
    this.buildsThumbnailsAsync = true     // main.js shouldn't add the empty placeholder
  }

  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)
    const gen = ++this._gen
    const { PPTXViewer } = await import('pptxviewjs')

    container.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.className = 'pptx-slide'
    const canvas = document.createElement('canvas')
    wrap.appendChild(canvas)
    container.appendChild(wrap)
    this._wrap   = wrap
    this._canvas = canvas

    this._view = new PPTXViewer({ canvas, slideSizeMode: 'fit' })
    await this._view.loadFile(buffer)
    this.numPages = this._view.getSlideCount() || 1
    this._idx = 0

    const sz = this._view.presentation?.slideSize
    if (sz?.cx && sz?.cy) {
      this._slideW = Math.round(sz.cx / EMU_PER_PX)
      this._slideH = Math.round(sz.cy / EMU_PER_PX)
    }

    await this._renderSlide(0)
    this._buildThumbnails(gen)   // background, non-blocking
  }

  // PptxViewJS fits the slide into the canvas's current backing size, so pin the
  // canvas to the slide's native pixels (correct aspect) before rendering.
  async _renderSlide(idx) {
    this._canvas.width  = this._slideW
    this._canvas.height = this._slideH
    await this._view.renderSlide(idx, this._canvas).catch(() => {})
  }

  async _buildThumbnails(gen) {
    const box = document.getElementById('thumbsContent')
    if (!box) return
    const tw = THUMB_W
    const th = Math.max(1, Math.round(tw * this._slideH / this._slideW))
    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    for (let i = 0; i < this.numPages; i++) {
      try { await this._view.renderSlide(i, canvas) } catch { /* skip this slide */ }
      if (gen !== this._gen || !this._view) return  // a newer doc loaded / destroyed

      // Use an <img> (not the canvas): max-width/height:auto scales an <img>
      // correctly to the sidebar width, whereas a <canvas> keeps its height.
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
    this._highlightThumb(this._idx + 1)
  }

  scrollToPage(n) {
    if (!this._view) return
    this._idx = Math.max(0, Math.min(this.numPages - 1, n - 1))
    this._renderSlide(this._idx)
    this._highlightThumb(this._idx + 1)
  }

  _highlightThumb(pageNum) {
    document.querySelectorAll('#thumbsContent .thumb').forEach(t => {
      t.classList.toggle('active', +t.dataset.thumbPage === pageNum)
    })
  }

  setScale(scale) {
    this.scale = scale
    if (this._wrap) this._wrap.style.zoom = scale === 1 ? '' : scale
  }

  getPageWidth()  { return this._slideW }
  getPageHeight() { return this._slideH }

  destroy() {
    this._gen++            // stop any in-flight thumbnail loop
    this._view   = null
    this._wrap   = null
    this._canvas = null
    super.destroy()
  }
}
