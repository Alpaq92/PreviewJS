import { BaseRenderer } from './base-renderer.js'

// PostScript / EPS (.ps / .eps) — interpreted and rasterized by Riposte, a
// pure-JS PostScript interpreter (MIT, zero runtime deps). Each page is rendered
// to a <canvas>, following the paged-canvas model the PDF / DjVu / comic
// renderers use (a `.postscript-page` per page, CSS `zoom` for scaling).
export class PostScriptRenderer extends BaseRenderer {
  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)

    const [{ loadDocument, pageSize, renderPageToDriver }, { CanvasDriver }] = await Promise.all([
      import('riposte/engine/document.js'),
      import('riposte/engine/graphics/canvas-driver.js'),
    ])

    // PostScript is byte-oriented; decode as Latin-1 (1 byte = 1 code unit) so
    // the source stays byte-exact for the interpreter.
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    let src = ''
    for (let i = 0; i < bytes.length; i += 8192) {
      src += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192))
    }
    const doc = loadDocument(src)

    container.innerHTML = ''
    for (let i = 0; i < doc.pageCount; i++) {
      const { width, height } = pageSize(doc, i)
      const page = document.createElement('div')
      page.className = 'postscript-page'
      page.dataset.page = String(i + 1)

      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width))   // natural size; CSS zoom scales it
      canvas.height = Math.max(1, Math.round(height))
      const ctx = canvas.getContext('2d')
      // An unsupported operator on one page must not sink the whole document:
      // keep whatever rendered, warn, and move on to the remaining pages.
      try {
        if (ctx) renderPageToDriver(doc, i, new CanvasDriver(ctx))
      } catch (e) {
        console.warn(`[PostScript] page ${i + 1} render error:`, e?.message || e)
      }

      page.appendChild(canvas)
      container.appendChild(page)
    }

    const first = doc.pageCount ? pageSize(doc, 0) : { width: 816, height: 1056 }
    this._pageW = Math.round(first.width) || 816
    this._pageH = Math.round(first.height) || 1056
    this.numPages = doc.pageCount || 1
  }

  setScale(scale) {
    this.scale = scale
    this.container?.querySelectorAll('.postscript-page').forEach((el) => {
      el.style.zoom = scale === 1 ? '' : scale
    })
  }

  getPageWidth()  { return this._pageW || 816 }
  getPageHeight() { return this._pageH || null }
}
