import { PDFRenderer  } from './renderers/pdf-renderer.js'
import { ODFRenderer  } from './renderers/odf-renderer.js'
import { RTFRenderer  } from './renderers/rtf-renderer.js'
import { DOCXRenderer } from './renderers/docx-renderer.js'
import { DOCRenderer  } from './renderers/doc-renderer.js'
import { MDRenderer   } from './renderers/md-renderer.js'
import { TXTRenderer  } from './renderers/txt-renderer.js'
import { ComicRenderer } from './renderers/comic-renderer.js'
import { EPUBRenderer } from './renderers/epub-renderer.js'
import { ImageRenderer } from './renderers/image-renderer.js'
import { PPTXRenderer } from './renderers/pptx-renderer.js'
import { CSVRenderer  } from './renderers/csv-renderer.js'
import { CodeRenderer } from './renderers/code-renderer.js'
import { XLSXRenderer } from './renderers/xlsx-renderer.js'
import { DjVuRenderer } from './renderers/djvu-renderer.js'
import { t, applyTranslations, setLang, getLang } from './i18n.js'

const CODE_EXTS = ['js','mjs','cjs','jsx','ts','tsx','json','jsonc','xml','html','htm',
  'yaml','yml','css','scss','less','py','java','c','h','cpp','cc','hpp','cs','go','rs',
  'rb','php','sh','bash','sql','kt','swift','toml','ini','diff']

const EXT_MAP = {
  pdf: 'pdf',
  djvu: 'djvu', djv: 'djvu',
  odt: 'odf', ods: 'odf', odp: 'odf', odg: 'odf', odm: 'odf', odf: 'odf',
  rtf: 'rtf',
  docx: 'docx',
  doc: 'doc',
  pptx: 'pptx',
  xlsx: 'xlsx', xls: 'xlsx', xlsm: 'xlsx', xlsb: 'xlsx',
  csv: 'csv', tsv: 'csv',
  ...Object.fromEntries(CODE_EXTS.map(e => [e, 'code'])),
  md: 'md', markdown: 'md',
  txt: 'txt', text: 'txt', log: 'txt',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  avif: 'image', bmp: 'image', svg: 'image', ico: 'image', tif: 'image', tiff: 'image',
  cbz: 'comic', cbr: 'comic', cbt: 'comic',
  epub: 'epub', mobi: 'epub', azw3: 'epub', azw: 'epub', kf8: 'epub',
  fb2: 'epub', fbz: 'epub',
}

class DocumentViewer {
  constructor() {
    this.renderers = {
      pdf:  new PDFRenderer(),
      odf:  new ODFRenderer(),
      rtf:  new RTFRenderer(),
      docx: new DOCXRenderer(),
      doc:  new DOCRenderer(),
      md:   new MDRenderer(),
      txt:  new TXTRenderer(),
      comic: new ComicRenderer(),
      epub: new EPUBRenderer(),
      image: new ImageRenderer(),
      pptx: new PPTXRenderer(),
      xlsx: new XLSXRenderer(),
      csv:  new CSVRenderer(),
      code: new CodeRenderer(),
      djvu: new DjVuRenderer(),
    }
    this.activeRenderer = null
    this.currentPage    = 1
    this.numPages       = 0
    this.scale          = 1.0

    this._bindUI()
    this._initI18n()
  }

  /* ── i18n ────────────────────────────────────────────────────────────── */
  _initI18n() {
    document.documentElement.lang = getLang()
    const sel = document.getElementById('langSelect')
    sel.value = getLang()
    sel.addEventListener('change', e => setLang(e.target.value))
    applyTranslations()
  }

  /* ── UI wiring ───────────────────────────────────────────────────────── */
  _bindUI() {
    // File open
    document.getElementById('fileInput').addEventListener('change', e => {
      const f = e.target.files?.[0]
      if (f) this.openFile(f)
      e.target.value = ''          // allow re-opening same file
    })

    // Drag-drop on the full window
    document.addEventListener('dragover', e => e.preventDefault())
    document.addEventListener('drop', e => {
      e.preventDefault()
      const f = e.dataTransfer.files?.[0]
      if (f) this.openFile(f)
    })
    const dz = document.getElementById('dropzone')
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over') })
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'))
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag-over')
      const f = e.dataTransfer.files?.[0]
      if (f) this.openFile(f)
    })
    dz.addEventListener('click', e => {
      if (e.target.tagName !== 'LABEL') document.getElementById('fileInput').click()
    })

    // Navigation
    document.getElementById('prevPage').addEventListener('click', () => this.changePage(-1))
    document.getElementById('nextPage').addEventListener('click', () => this.changePage(1))

    const pageInput = document.getElementById('pageNumber')
    const commitPage = () => {
      const n = parseInt(pageInput.value, 10)
      if (!isNaN(n)) this.goToPage(n)
    }
    pageInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitPage() })
    pageInput.addEventListener('blur', commitPage)

    // Zoom
    document.getElementById('zoomIn' ).addEventListener('click', () => this.adjustScale(+0.25))
    document.getElementById('zoomOut').addEventListener('click', () => this.adjustScale(-0.25))
    document.getElementById('scaleSelect').addEventListener('change', e => this._applyScaleOption(e.target.value))

    // Print
    document.getElementById('printBtn').addEventListener('click', () => this.print())

    // Sidebar
    document.getElementById('sidebarToggle').addEventListener('click', () => this._toggleSidebar())

    // Error bar
    document.getElementById('errorClose').addEventListener('click', () => {
      document.getElementById('errorBar').classList.add('hidden')
    })

    // Keyboard shortcuts
    document.addEventListener('keydown', e => this._onKey(e))
  }

  /* ── File loading ────────────────────────────────────────────────────── */
  async openFile(file) {
    const ext    = file.name.split('.').pop().toLowerCase()
    const format = EXT_MAP[ext]

    if (!format) {
      this._showError(t('err.unsupported', { ext, list: Object.keys(EXT_MAP).join(', ') }))
      return
    }

    this._setLoading(true)
    this._hideDropzone()

    try {
      const buffer   = await file.arrayBuffer()
      const renderer = this.renderers[format]
      this.currentFileName = file.name   // used by foliate for format hinting

      this.activeRenderer?.destroy()
      this.activeRenderer = renderer

      const container = document.getElementById('docContainer')
      container.innerHTML = ''
      document.getElementById('thumbsContent').innerHTML = ''  // clear stale thumbs

      await renderer.load(buffer, container, this)

      this.numPages    = renderer.numPages
      this.currentPage = 1

      // Renderers may prefer a default zoom (e.g. comics fit to width);
      // otherwise keep 100% without forcing a redundant re-render.
      const scaleOpt = renderer.defaultScaleOption || '1'
      document.getElementById('scaleSelect').value = scaleOpt
      if (renderer.defaultScaleOption) this._applyScaleOption(scaleOpt)
      else this.scale = 1.0

      this.updatePageInfo()
      this._refreshThumbsPlaceholder()
      this._setFormatBadge(format)
      document.title = `${file.name} — ReaderJS`
    } catch (err) {
      console.error('[ReaderJS] load error:', err)
      this._showError(t('err.couldNotOpen', { name: file.name, msg: err.message }))
    } finally {
      this._setLoading(false)
    }
  }

  /* ── Page navigation ─────────────────────────────────────────────────── */
  changePage(delta) {
    this.goToPage(this.currentPage + delta)
  }

  goToPage(page) {
    if (!this.activeRenderer) return
    page = Math.max(1, Math.min(this.numPages, page))
    this.currentPage = page
    this.activeRenderer.scrollToPage(page)
    this.updatePageInfo()
  }

  updatePageInfo() {
    document.getElementById('pageNumber').value = this.currentPage
    document.getElementById('totalPages').textContent = this.numPages || '—'
    document.getElementById('prevPage').disabled = this.currentPage <= 1
    document.getElementById('nextPage').disabled = this.currentPage >= this.numPages
  }

  /* ── Zoom ────────────────────────────────────────────────────────────── */
  adjustScale(delta) {
    const next = Math.max(0.25, Math.min(5.0, this.scale + delta))
    this._setScale(next)
    document.getElementById('scaleSelect').value = next.toString()
  }

  _applyScaleOption(value) {
    if (value === 'auto' || value === 'page-fit' || value === 'page-width' || value === 'page-height') {
      const vc = document.getElementById('viewerContainer')
      const w  = vc.clientWidth  - 48
      const h  = vc.clientHeight - 48

      const pw = this.activeRenderer?.getPageWidth()  || 816
      const ph = this.activeRenderer?.getPageHeight() || 1056

      if (value === 'page-width') {
        this._setScale(w / pw)
      } else if (value === 'page-height') {
        this._setScale(h / ph)
      } else if (value === 'page-fit') {
        this._setScale(Math.min(w / pw, h / ph))
      } else {
        this._setScale(1)
      }
    } else {
      this._setScale(parseFloat(value))
    }
  }

  _setScale(scale) {
    this.scale = scale
    this.activeRenderer?.setScale(scale)
  }

  /* ── Print ───────────────────────────────────────────────────────────── */
  async print() {
    if (!this.activeRenderer) { this._showError(t('err.noDocument')); return }

    this._setLoading(true)
    try {
      await this.activeRenderer.preparePrint()
      window.print()
      // Cleanup after a moment to let the print dialog open
      setTimeout(() => {
        this.activeRenderer?.cleanupAfterPrint()
        this._setLoading(false)
      }, 1500)
    } catch (err) {
      this._showError(t('err.printFailed', { msg: err.message }))
      this.activeRenderer?.cleanupAfterPrint()
      this._setLoading(false)
    }
  }

  /* ── Keyboard shortcuts ──────────────────────────────────────────────── */
  _onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return

    const ctrl = e.ctrlKey || e.metaKey
    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
        this.changePage(-1); break
      case 'ArrowRight':
      case 'PageDown':
        this.changePage(1); break
      case 'Home':
        this.goToPage(1); break
      case 'End':
        this.goToPage(this.numPages); break
      case '+': case '=':
        if (ctrl) { e.preventDefault(); this.adjustScale(+0.25) } break
      case '-':
        if (ctrl) { e.preventDefault(); this.adjustScale(-0.25) } break
      case 'p':
        if (ctrl) { e.preventDefault(); this.print() } break
    }
  }

  /* ── UI helpers ──────────────────────────────────────────────────────── */
  _setLoading(on) {
    document.getElementById('loadingBar').classList.toggle('hidden', !on)
  }

  _showError(msg) {
    document.getElementById('errorMsg').textContent = msg
    document.getElementById('errorBar').classList.remove('hidden')
    clearTimeout(this._errTimer)
    this._errTimer = setTimeout(() => document.getElementById('errorBar').classList.add('hidden'), 6000)
  }

  _hideDropzone() {
    document.getElementById('dropzone').classList.add('hidden')
    document.getElementById('docContainer').classList.remove('hidden')
  }

  _setFormatBadge(format) {
    const b = document.getElementById('formatBadge')
    b.textContent = format.toUpperCase()
    b.className   = `badge-${format}`
    b.classList.remove('hidden')
  }

  _toggleSidebar() {
    document.getElementById('outerContainer').classList.toggle('sidebar-open')
  }

  // Renderers that paginate build their own thumbnails; show a placeholder for
  // single-page / reflowable formats so the sidebar never looks broken.
  _refreshThumbsPlaceholder() {
    if (this.activeRenderer?.buildsThumbnailsAsync) return  // renderer fills it itself
    const box = document.getElementById('thumbsContent')
    if (box.children.length) return
    const p = document.createElement('div')
    p.className = 'thumbs-empty'
    p.dataset.i18n = 'sidebar.noThumbnails'
    p.textContent = t('sidebar.noThumbnails')
    box.appendChild(p)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.viewer = new DocumentViewer()
})
