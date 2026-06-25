import { BaseRenderer } from './base-renderer.js'
import JSZip from 'jszip'

const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i
const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
}

// Natural sort so "page2.jpg" precedes "page10.jpg"
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Renders comic-book archives — CBZ (ZIP), CBR (RAR) and CBT (TAR) — as a
 * vertical stack of page images.
 *
 * CBZ is unpacked with JSZip (already a dependency). CBR and CBT are unpacked
 * with libarchive.js, whose RAR decoder is a clean-room BSD implementation
 * (part of libarchive) — no UnRAR-licensed code is involved.
 */
export class ComicRenderer extends BaseRenderer {
  constructor() {
    super()
    this._imgUrls  = []
    this._observer = null
    this._naturalW = 0
    this._naturalH = 0
  }

  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)

    const pages = await this._extract(buffer)
    if (!pages.length) throw new Error('No images found in comic archive')

    container.innerHTML = ''
    for (const [i, p] of pages.entries()) {
      const wrap = document.createElement('div')
      wrap.className = 'comic-page'
      wrap.dataset.page = i + 1

      const img = document.createElement('img')
      img.src = p.url
      img.alt = p.name
      img.loading = 'lazy'
      img.draggable = false

      wrap.appendChild(img)
      container.appendChild(wrap)
    }

    this.numPages = pages.length

    await this._measureFirst(pages[0].url)
    this.setScale(this.scale)
    this._attachScrollObserver()
    this._buildThumbnails(pages)
  }

  /* ── Extraction ──────────────────────────────────────────────────────── */
  async _extract(buffer) {
    // Sniff the container by magic bytes rather than trusting the extension.
    const sig = new Uint8Array(buffer.slice(0, 4))
    const isZip = sig[0] === 0x50 && sig[1] === 0x4b // "PK"
    return isZip ? this._extractZip(buffer) : this._extractArchive(buffer)
  }

  async _extractZip(buffer) {
    const zip = await JSZip.loadAsync(buffer)
    const entries = []
    zip.forEach((path, file) => {
      if (!file.dir && IMAGE_RE.test(path)) entries.push({ path, file })
    })
    entries.sort((a, b) => naturalCompare(a.path, b.path))

    const pages = []
    for (const { path, file } of entries) {
      const data = await file.async('uint8array')
      pages.push({ name: path, url: this._toUrl(data, path) })
    }
    return pages
  }

  async _extractArchive(buffer) {
    const { Archive } = await import('libarchive.js')
    Archive.init({ workerUrl: '/libarchive/worker-bundle.js' })

    const archive  = await Archive.open(new Blob([buffer]))
    const fileList = await archive.getFilesArray()

    const imgs = fileList
      .filter(e => IMAGE_RE.test(e.file.name))
      .sort((a, b) => naturalCompare((a.path || '') + a.file.name, (b.path || '') + b.file.name))

    const pages = []
    for (const entry of imgs) {
      const extracted = await entry.file.extract()
      const data = new Uint8Array(await extracted.arrayBuffer())
      pages.push({ name: entry.file.name, url: this._toUrl(data, entry.file.name) })
    }
    await archive.close?.()
    return pages
  }

  _toUrl(data, name) {
    const ext  = name.split('.').pop().toLowerCase()
    const type = MIME[ext] ?? 'application/octet-stream'
    const url  = URL.createObjectURL(new Blob([data], { type }))
    this._imgUrls.push(url)
    return url
  }

  _measureFirst(url) {
    return new Promise(resolve => {
      const probe = new Image()
      probe.onload = () => {
        this._naturalW = probe.naturalWidth
        this._naturalH = probe.naturalHeight
        resolve()
      }
      probe.onerror = () => resolve()
      probe.src = url
    })
  }

  /* ── Zoom ────────────────────────────────────────────────────────────── */
  setScale(scale) {
    this.scale = scale
    if (!this._naturalW) return
    const w = Math.round(this._naturalW * scale)
    this.container?.querySelectorAll('.comic-page').forEach(el => {
      el.style.width = `${w}px`
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

    this.container.querySelectorAll('.comic-page').forEach(el => this._observer.observe(el))
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
      wrap.title = `Page ${i + 1}`

      const img = document.createElement('img')
      img.src = p.url
      img.loading = 'lazy'

      const lbl = document.createElement('div')
      lbl.className = 'thumb-label'
      lbl.textContent = i + 1

      wrap.appendChild(img)
      wrap.appendChild(lbl)
      wrap.addEventListener('click', () => this.viewer?.goToPage(i + 1))
      box.appendChild(wrap)
    })
  }

  _highlightThumb(pageNum) {
    document.querySelectorAll('.thumb').forEach(t => {
      t.classList.toggle('active', +t.dataset.thumbPage === pageNum)
    })
  }

  scrollToPage(pageNum) {
    const el = this.container?.querySelector(`.comic-page[data-page="${pageNum}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  destroy() {
    this._observer?.disconnect()
    this._observer = null
    this._imgUrls.forEach(u => URL.revokeObjectURL(u))
    this._imgUrls = []
    super.destroy()
  }
}
