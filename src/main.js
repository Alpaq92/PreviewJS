import { t, applyTranslations, setLang, getLang } from './i18n.js'
import { flattenBlocks } from './dom-text.js'

// Each format's renderer module is imported on demand, so opening a document
// only pulls that format's engine (pdf.js, mammoth, foliate, libarchive, …).
// Keeps the initial bundle lean — important for the embeddable build.
const RENDERER_LOADERS = {
  pdf:   () => import('./renderers/pdf-renderer.js').then(m => new m.PDFRenderer()),
  odf:   () => import('./renderers/odf-renderer.js').then(m => new m.ODFRenderer()),
  rtf:   () => import('./renderers/rtf-renderer.js').then(m => new m.RTFRenderer()),
  docx:  () => import('./renderers/docx-renderer.js').then(m => new m.DOCXRenderer()),
  doc:   () => import('./renderers/doc-renderer.js').then(m => new m.DOCRenderer()),
  md:    () => import('./renderers/md-renderer.js').then(m => new m.MDRenderer()),
  txt:   () => import('./renderers/txt-renderer.js').then(m => new m.TXTRenderer()),
  comic: () => import('./renderers/comic-renderer.js').then(m => new m.ComicRenderer()),
  epub:  () => import('./renderers/epub-renderer.js').then(m => new m.EPUBRenderer()),
  image: () => import('./renderers/image-renderer.js').then(m => new m.ImageRenderer()),
  pptx:  () => import('./renderers/pptx-renderer.js').then(m => new m.PPTXRenderer()),
  xlsx:  () => import('./renderers/xlsx-renderer.js').then(m => new m.XLSXRenderer()),
  csv:   () => import('./renderers/csv-renderer.js').then(m => new m.CSVRenderer()),
  code:  () => import('./renderers/code-renderer.js').then(m => new m.CodeRenderer()),
  djvu:  () => import('./renderers/djvu-renderer.js').then(m => new m.DjVuRenderer()),
}

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

// Formats whose rendered output is text/HTML we can diff. The rest (pdf, djvu,
// comic, image, pptx, epub) are canvas/reflowable → not text-comparable.
const DIFFABLE = new Set(['txt', 'md', 'docx', 'rtf', 'odf', 'doc', 'code', 'csv', 'xlsx'])

// Tags that imply a line break when flattening rich HTML to comparable text.
const BLOCK_TAGS = new Set(['P','DIV','LI','H1','H2','H3','H4','H5','H6','TR','TABLE',
  'BLOCKQUOTE','PRE','HR','SECTION','ARTICLE','UL','OL','DD','DT','FIGURE','FIGCAPTION'])

// Rows of `.data-table` / xlsx sheets → tab-separated lines (so diffLines aligns
// per row and the word diff aligns per cell).
function tableText(page) {
  const out = []
  page.querySelectorAll('.sheet-title, table').forEach(node => {
    if (node.tagName === 'H3') out.push('# ' + node.textContent)
    else for (const tr of node.querySelectorAll('tr'))
      out.push([...tr.children].map(c => c.textContent.replace(/\t/g, ' ')).join('\t'))
  })
  return out.join('\n')
}

// A diffable text representation of a freshly-rendered `.doc-page`.
function extractRendered(host, format) {
  const page = host.querySelector('.doc-page') || host
  if (format === 'txt')  return (page.querySelector('.txt-content') || page).textContent
  if (format === 'code') return (page.querySelector('pre code') || page).textContent
  if (format === 'csv' || format === 'xlsx') return tableText(page)
  return flattenBlocks(page, BLOCK_TAGS).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export class DocumentViewer {
  constructor() {
    this._rendererCache    = new Map()   // format → renderer instance (built once, reused)
    this._rendererPromises = new Map()   // format → in-flight import promise (dedupes concurrent opens)
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
    if (sel) {
      sel.value = getLang()
      sel.addEventListener('change', e => setLang(e.target.value))
    }
    applyTranslations()
  }

  /* ── UI wiring ───────────────────────────────────────────────────────── */
  _bindUI() {
    // File open + drag-drop — only in the full app. The embeddable build omits
    // the dropzone/file input (the host hands documents in as bytes), so this
    // whole block is skipped when those elements are absent.
    const fileInput = document.getElementById('fileInput')
    const dz = document.getElementById('dropzone')
    if (fileInput && dz) {
      fileInput.addEventListener('change', e => {
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
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over') })
      dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'))
      dz.addEventListener('drop', e => {
        e.preventDefault(); dz.classList.remove('drag-over')
        const f = e.dataTransfer.files?.[0]
        if (f) this.openFile(f)
      })
      dz.addEventListener('click', e => {
        if (e.target.tagName !== 'LABEL') fileInput.click()
      })

      // Compare: pick two files in one dialog (a chained second file dialog is
      // blocked by browsers — no user gesture). The embed passes versions +
      // blame programmatically via compare().
      const cmpBtn = document.getElementById('compareBtn')
      const cmpInput = document.getElementById('compareInput')
      if (cmpBtn && cmpInput) {
        cmpBtn.addEventListener('click', () => cmpInput.click())
        cmpInput.addEventListener('change', e => {
          const files = [...(e.target.files || [])].sort((a, b) => a.name.localeCompare(b.name))
          e.target.value = ''
          if (files.length >= 2) this.compare(files[0], files[0].name, files[1], files[1].name)
          else if (files.length === 1) this._showError(t('compare.pickTwo'))
        })
      }
    }

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
    // Double-click the sidebar header ("Pages") to close the thumbnail sidebar.
    document.getElementById('sidebarToolbar')?.addEventListener('dblclick', () => {
      document.getElementById('outerContainer').classList.remove('sidebar-open')
    })

    // Error bar
    document.getElementById('errorClose').addEventListener('click', () => {
      document.getElementById('errorBar').classList.add('hidden')
    })

    // Keyboard shortcuts
    document.addEventListener('keydown', e => this._onKey(e))
  }

  /* ── File loading ────────────────────────────────────────────────────── */
  // Lazily import + instantiate a format's renderer. Cached so it's built once;
  // concurrent opens of the same format share a single in-flight import.
  _getRenderer(format) {
    if (this._rendererCache.has(format)) return Promise.resolve(this._rendererCache.get(format))
    if (this._rendererPromises.has(format)) return this._rendererPromises.get(format)
    const p = RENDERER_LOADERS[format]().then(inst => {
      this._rendererCache.set(format, inst)
      this._rendererPromises.delete(format)
      return inst
    })
    this._rendererPromises.set(format, p)
    return p
  }

  // Full app: open a picked File (dropzone / file input / drag-drop).
  openFile(file) {
    return this.loadBytes(file, file.name, file.type)
  }

  // Render raw bytes given a filename — its extension selects the renderer.
  // The embeddable build feeds documents this way (no File object needed).
  // `source` is a Blob/File or an ArrayBuffer.
  async loadBytes(source, name, mime) {
    const ext    = (name || '').split('.').pop().toLowerCase()
    const format = EXT_MAP[ext]

    if (!format) {
      this._showError(t('err.unsupported', { ext, list: Object.keys(EXT_MAP).join(', ') }))
      return
    }

    this._setLoading(true)
    this._hideDropzone()

    try {
      const buffer   = source instanceof ArrayBuffer ? source : await source.arrayBuffer()
      const renderer = await this._getRenderer(format)
      this.currentFileName = name   // used by foliate for format hinting

      this._clearCompare()
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
      const scaleSel = document.getElementById('scaleSelect')
      if (scaleSel) scaleSel.value = scaleOpt
      if (renderer.defaultScaleOption) this._applyScaleOption(scaleOpt)
      else this.scale = 1.0

      this.updatePageInfo()
      this._refreshThumbsPlaceholder()
      this._setFormatBadge(format)
      document.title = `${name} — ReaderJS`
    } catch (err) {
      console.error('[ReaderJS] load error:', err)
      this._showError(t('err.couldNotOpen', { name, msg: err.message }))
    } finally {
      this._setLoading(false)
    }
  }

  /* ── Compare two versions ────────────────────────────────────────────── */
  // Render a version's bytes with a FRESH renderer into a detached node and
  // extract a diffable text representation — never touches the live viewer.
  async _extractText(buffer, name) {
    const ext = (name || '').split('.').pop().toLowerCase()
    const format = EXT_MAP[ext]
    const unsupported = () => Object.assign(new Error('unsupported-compare'), { code: 'unsupported-compare', format: format || ext })
    if (!format) throw unsupported()
    const renderer = await RENDERER_LOADERS[format]()   // fresh, not the cached singleton
    try {
      // Renderers that read text straight from their engine (e.g. PDF's text
      // layer) skip the DOM render entirely.
      if (typeof renderer.extractText === 'function') {
        return { pages: await renderer.extractText(buffer, name), format }   // string[] — one per page
      }
      if (!DIFFABLE.has(format)) throw unsupported()
      const host = document.createElement('div')        // detached — off the live DOM
      await renderer.load(buffer, host, { currentFileName: name })
      return { pages: [extractRendered(host, format)], format }   // continuous formats: one page
    } finally {
      renderer.destroy?.()
    }
  }

  // Compare two document versions. `opts`: { blame: { [newLineNo]: {...} }, mode }.
  async compare(srcA, nameA, srcB, nameB, opts = {}) {
    this._setLoading(true)
    this._hideDropzone()
    try {
      const toBuf = s => (s instanceof ArrayBuffer ? s : s.arrayBuffer())
      const [bufA, bufB] = await Promise.all([toBuf(srcA), toBuf(srcB)])
      const [a, b] = await Promise.all([this._extractText(bufA, nameA), this._extractText(bufB, nameB)])

      this._clearCompare()
      this.activeRenderer?.destroy()
      this.activeRenderer = null

      const container = document.getElementById('docContainer')
      container.innerHTML = ''
      document.getElementById('thumbsContent').innerHTML = ''

      const page = document.createElement('div')
      page.className = 'diff-page'
      container.appendChild(page)
      document.getElementById('mainContainer').classList.add('is-compare')   // full-bleed diff + flat toolbar

      // Each extractor returns its pages (string[]); line them up and diff per page.
      const aPages = a.pages, bPages = b.pages
      const pageCount = Math.max(aPages.length, bPages.length)
      const pages = []
      for (let i = 0; i < pageCount; i++) pages.push({ leftText: aPages[i] ?? '', rightText: bPages[i] ?? '' })

      const { renderCompare } = await import('./diff-view.js')
      this._compareCtl = renderCompare(page, {
        pages, blame: opts.blame || {}, mode: opts.mode || 'side-by-side',
      })

      // drive the view mode from the top-toolbar dropdown (shown via .is-compare)
      const modeSel = document.getElementById('compareModeSelect')
      if (modeSel) {
        modeSel.value = opts.mode || 'side-by-side'
        modeSel.onchange = () => this._compareCtl?.setMode(modeSel.value)
      }

      this.numPages = pageCount; this.currentPage = 1
      this.updatePageInfo()
      const badge = document.getElementById('formatBadge')
      badge.textContent = t('compare.badge')
      badge.className = 'badge-compare'
      badge.classList.remove('hidden')
      document.title = `${nameA} ↔ ${nameB} — ReaderJS`
    } catch (err) {
      if (err.code === 'unsupported-compare') {
        this._showError(t('compare.unsupported', { format: String(err.format || '').toUpperCase() }))
      } else {
        console.error('[ReaderJS] compare error:', err)
        this._showError(t('err.couldNotOpen', { name: `${nameA} ↔ ${nameB}`, msg: err.message }))
      }
    } finally {
      this._setLoading(false)
    }
  }

  _clearCompare() {
    this._compareCtl?.destroy()
    this._compareCtl = null
    document.getElementById('mainContainer')?.classList.remove('is-compare')
    const modeSel = document.getElementById('compareModeSelect')
    if (modeSel) modeSel.onchange = null
  }

  /* ── Page navigation ─────────────────────────────────────────────────── */
  changePage(delta) {
    this.goToPage(this.currentPage + delta)
  }

  goToPage(page) {
    if (!this.activeRenderer && !this._compareCtl) return
    page = Math.max(1, Math.min(this.numPages, page))
    this.currentPage = page
    if (this._compareCtl) {
      this._compareCtl.setPage(page - 1)                       // compare pages are 0-based
      document.getElementById('viewerContainer').scrollTop = 0  // show the top of the new page
    } else {
      this.activeRenderer.scrollToPage(page)
    }
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
    document.getElementById('dropzone')?.classList.add('hidden')
    document.getElementById('docContainer')?.classList.remove('hidden')
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

// Auto-boot the full app. The embeddable page (reader.html) has no #dropzone
// and boots its own viewer via src/reader.js, so this stays out of its way.
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('dropzone')) {
    window.viewer = new DocumentViewer()
  }
})
