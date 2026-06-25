import { BaseRenderer } from './base-renderer.js'
import { t } from '../i18n.js'

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml',
  ico: 'image/x-icon',
}
const isTiff = name => /\.tiff?$/i.test(name)

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return String(d)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Renders images. Native formats (PNG/JPEG/GIF/WebP/AVIF/BMP/SVG/ICO) go straight
 * into an <img>; TIFF is decoded with UTIF.js (multi-page TIFFs become multiple
 * pages). EXIF metadata is parsed with exifr and shown in an info panel.
 */
export class ImageRenderer extends BaseRenderer {
  constructor() {
    super()
    this._urls     = []
    this._observer = null
    this._naturalW = 0
    this._naturalH = 0
    this.defaultScaleOption = 'page-fit'  // show the whole image on open
  }

  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)
    const name = viewer?.currentFileName || 'image'
    const ext  = (name.split('.').pop() || '').toLowerCase()

    container.innerHTML = ''

    const pages = isTiff(name)
      ? await this._decodeTiff(buffer)
      : [await this._nativeImage(buffer, ext)]

    for (const [i, p] of pages.entries()) {
      const wrap = document.createElement('div')
      wrap.className = 'image-page'
      wrap.dataset.page = i + 1
      wrap.dataset.nw = p.w
      wrap.appendChild(p.node)
      container.appendChild(wrap)
    }

    this.numPages  = pages.length
    this._naturalW = pages[0].w
    this._naturalH = pages[0].h

    const exif = await this._readExif(buffer).catch(() => null)
    this._renderInfo(container, ext, buffer.byteLength, pages[0], exif)

    this.setScale(this.scale)
    this._attachScrollObserver()
    this._buildThumbnails(pages)
  }

  async _nativeImage(buffer, ext) {
    const type = MIME[ext] || 'application/octet-stream'
    const url  = URL.createObjectURL(new Blob([buffer], { type }))
    this._urls.push(url)
    const img = document.createElement('img')
    img.draggable = false
    img.alt = ''
    await new Promise(res => { img.onload = res; img.onerror = res; img.src = url })
    return { node: img, w: img.naturalWidth || 0, h: img.naturalHeight || 0 }
  }

  async _decodeTiff(buffer) {
    const mod  = await import('utif')
    const UTIF = mod.default || mod
    const ifds = UTIF.decode(buffer)
    const pages = []
    for (const ifd of ifds) {
      try {
        UTIF.decodeImage(buffer, ifd, ifds)
        if (!ifd.width || !ifd.height) continue
        const rgba   = UTIF.toRGBA8(ifd)
        const canvas = document.createElement('canvas')
        canvas.width  = ifd.width
        canvas.height = ifd.height
        canvas.getContext('2d').putImageData(
          new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height), 0, 0)
        pages.push({ node: canvas, w: ifd.width, h: ifd.height })
      } catch { /* skip an IFD we can't decode (e.g. an embedded thumbnail) */ }
    }
    if (!pages.length) throw new Error('Could not decode TIFF')
    return pages
  }

  async _readExif(buffer) {
    const mod   = await import('exifr')
    const exifr = mod.default || mod
    return exifr.parse(buffer, { tiff: true, exif: true, gps: true, ifd0: true })
  }

  _renderInfo(container, ext, bytes, page, exif) {
    // rows are [i18n-key, value] — the key drives data-i18n so labels stay
    // reactive to language switches; values are dynamic data (not translated).
    const rows = [
      ['info.format', ext.toUpperCase()],
      ['info.dimensions', `${page.w} × ${page.h}`],
      ['info.size', humanSize(bytes)],
    ]
    if (exif) {
      const camera = [exif.Make, exif.Model].filter(Boolean).join(' ').trim()
      if (camera) rows.push(['info.camera', camera])
      if (exif.LensModel) rows.push(['info.lens', exif.LensModel])
      const date = exif.DateTimeOriginal || exif.CreateDate
      if (date) rows.push(['info.dateTaken', formatDate(date)])
      if (exif.FocalLength) rows.push(['info.focalLength', `${Math.round(exif.FocalLength)} mm`])
      const exp = []
      if (exif.FNumber) exp.push(`ƒ/${exif.FNumber}`)
      if (exif.ExposureTime)
        exp.push(exif.ExposureTime >= 1 ? `${exif.ExposureTime}s` : `1/${Math.round(1 / exif.ExposureTime)}s`)
      if (exif.ISO) exp.push(`ISO ${exif.ISO}`)
      if (exp.length) rows.push(['info.exposure', exp.join(' · ')])
      if (typeof exif.latitude === 'number' && typeof exif.longitude === 'number')
        rows.push(['info.gps', `${exif.latitude.toFixed(5)}, ${exif.longitude.toFixed(5)}`])
    }

    const panel = document.createElement('div')
    panel.className = 'image-info'
    const h = document.createElement('h3')
    h.dataset.i18n = 'info.heading'
    h.textContent = t('info.heading')
    panel.appendChild(h)
    const dl = document.createElement('dl')
    for (const [key, v] of rows) {
      const dt = document.createElement('dt')
      dt.dataset.i18n = key
      dt.textContent = t(key)
      const dd = document.createElement('dd')
      dd.textContent = v
      dl.append(dt, dd)
    }
    panel.appendChild(dl)
    container.appendChild(panel)
  }

  /* ── Zoom ────────────────────────────────────────────────────────────── */
  setScale(scale) {
    this.scale = scale
    this.container?.querySelectorAll('.image-page').forEach(el => {
      const nw = +el.dataset.nw || this._naturalW
      if (nw) el.style.width = `${Math.round(nw * scale)}px`
    })
  }

  getPageWidth()  { return this._naturalW || null }
  getPageHeight() { return this._naturalH || null }

  /* ── Scroll tracking ─────────────────────────────────────────────────── */
  _attachScrollObserver() {
    if (this._observer) this._observer.disconnect()
    const root = this.container.parentElement
    this._observer = new IntersectionObserver(entries => {
      let best = { ratio: 0, page: this.viewer?.currentPage || 1 }
      entries.forEach(e => {
        if (e.intersectionRatio > best.ratio) best = { ratio: e.intersectionRatio, page: +e.target.dataset.page }
      })
      if (best.ratio > 0 && this.viewer && best.page !== this.viewer.currentPage) {
        this.viewer.currentPage = best.page
        this.viewer.updatePageInfo()
        this._highlightThumb(best.page)
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1], root })
    this.container.querySelectorAll('.image-page').forEach(el => this._observer.observe(el))
  }

  /* ── Thumbnails ──────────────────────────────────────────────────────── */
  _buildThumbnails(pages) {
    const box = document.getElementById('thumbsContent')
    if (!box) return
    box.innerHTML = ''
    pages.forEach((p, i) => {
      const wrap = document.createElement('div')
      wrap.className = 'thumb'
      wrap.dataset.thumbPage = i + 1
      const img = document.createElement('img')
      img.loading = 'lazy'
      img.src = p.node.tagName === 'CANVAS' ? p.node.toDataURL('image/png') : p.node.src
      const lbl = document.createElement('div')
      lbl.className = 'thumb-label'
      lbl.textContent = i + 1
      wrap.append(img, lbl)
      wrap.addEventListener('click', () => this.viewer?.goToPage(i + 1))
      box.appendChild(wrap)
    })
  }

  _highlightThumb(pageNum) {
    document.querySelectorAll('.thumb').forEach(thmb => {
      thmb.classList.toggle('active', +thmb.dataset.thumbPage === pageNum)
    })
  }

  scrollToPage(pageNum) {
    const el = this.container?.querySelector(`.image-page[data-page="${pageNum}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  destroy() {
    this._observer?.disconnect()
    this._observer = null
    this._urls.forEach(u => URL.revokeObjectURL(u))
    this._urls = []
    super.destroy()
  }
}
