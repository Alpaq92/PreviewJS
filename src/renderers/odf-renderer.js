import { BaseRenderer } from './base-renderer.js'
import JSZip from 'jszip'

// Namespace shorthands used in ODF XML
const NS = {
  text:  'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw:  'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  fo:    'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
}

// Prefix → ns map for createElementNS-free querying via getElementsByTagNameNS
function qall(parent, ns, local) {
  return [...parent.getElementsByTagNameNS(ns, local)]
}
function q(parent, ns, local) {
  return parent.getElementsByTagNameNS(ns, local)[0] ?? null
}

export class ODFRenderer extends BaseRenderer {
  constructor() {
    super()
    this._imgUrls = []
  }

  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)

    const zip = await JSZip.loadAsync(buffer)

    // Validate it's actually an ODF file
    const mimeEntry = zip.file('mimetype')
    if (!mimeEntry) throw new Error('Not a valid ODF file (missing mimetype entry)')
    const mime = (await mimeEntry.async('string')).trim()
    if (!mime.startsWith('application/vnd.oasis.opendocument')) {
      throw new Error(`Unexpected MIME type: ${mime}`)
    }

    const contentEntry = zip.file('content.xml')
    if (!contentEntry) throw new Error('ODF file has no content.xml')
    const contentXml = await contentEntry.async('string')

    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(contentXml, 'application/xml')

    const parseError = q(xmlDoc, 'http://www.mozilla.org/newlayout/xml/parsererror.xml', 'parseerror')
    if (parseError) throw new Error(`content.xml parse error: ${parseError.textContent.slice(0, 120)}`)

    // Build a map of image href → object URL for embedded images
    const imgMap = await this._extractImages(zip)

    const html = await this._convertToHtml(xmlDoc, imgMap)

    container.innerHTML = ''
    const page = document.createElement('div')
    page.className = 'doc-page'
    page.dataset.page = 1
    page.innerHTML = html
    container.appendChild(page)

    this.numPages = 1
  }

  async _extractImages(zip) {
    const map = {}
    zip.forEach((relPath, file) => {
      if (/^(Pictures|images)\//i.test(relPath) && !file.dir) {
        // We'll resolve lazily below
        map[relPath] = file
      }
    })
    // Resolve to blob URLs
    const resolved = {}
    for (const [path, file] of Object.entries(map)) {
      const data = await file.async('uint8array')
      const ext  = path.split('.').pop().toLowerCase()
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                     gif: 'image/gif', svg: 'image/svg+xml' }[ext] ?? 'application/octet-stream'
      const url  = URL.createObjectURL(new Blob([data], { type: mime }))
      this._imgUrls.push(url)
      resolved[path] = url
    }
    return resolved
  }

  _convertToHtml(xmlDoc, imgMap) {
    // body is inside office:body > office:text (for Writer) or office:spreadsheet, etc.
    const body = xmlDoc.querySelector('*|body') ?? xmlDoc.documentElement
    const sb = []
    this._nodeToHtml(body, sb, imgMap)
    return sb.join('')
  }

  _nodeToHtml(node, sb, imgMap) {
    if (node.nodeType === Node.TEXT_NODE) {
      sb.push(this._esc(node.textContent))
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const ns    = node.namespaceURI
    const local = node.localName

    // ── text namespace ─────────────────────────────────────────────────────
    if (ns === NS.text) {
      if (local === 'p') {
        sb.push('<p>')
        this._childrenToHtml(node, sb, imgMap)
        sb.push('</p>')
        return
      }
      if (local === 'h') {
        const lvl = Math.min(6, Math.max(1, parseInt(node.getAttributeNS(NS.text, 'outline-level') || '1', 10)))
        sb.push(`<h${lvl}>`)
        this._childrenToHtml(node, sb, imgMap)
        sb.push(`</h${lvl}>`)
        return
      }
      if (local === 'span') {
        sb.push('<span>')
        this._childrenToHtml(node, sb, imgMap)
        sb.push('</span>')
        return
      }
      if (local === 'a') {
        const href = node.getAttributeNS(NS.xlink, 'href') || '#'
        sb.push(`<a href="${this._esc(href)}" target="_blank" rel="noopener">`)
        this._childrenToHtml(node, sb, imgMap)
        sb.push('</a>')
        return
      }
      if (local === 'line-break') { sb.push('<br>'); return }
      if (local === 's')          { sb.push('&nbsp;'); return }
      if (local === 'tab')        { sb.push('&emsp;'); return }
      if (local === 'list') {
        sb.push('<ul>')
        this._childrenToHtml(node, sb, imgMap)
        sb.push('</ul>')
        return
      }
      if (local === 'list-item') {
        sb.push('<li>')
        this._childrenToHtml(node, sb, imgMap)
        sb.push('</li>')
        return
      }
    }

    // ── table namespace ─────────────────────────────────────────────────────
    if (ns === NS.table) {
      if (local === 'table')      { sb.push('<table>'); this._childrenToHtml(node, sb, imgMap); sb.push('</table>'); return }
      if (local === 'table-row')  { sb.push('<tr>');    this._childrenToHtml(node, sb, imgMap); sb.push('</tr>');    return }
      if (local === 'table-cell') { sb.push('<td>');    this._childrenToHtml(node, sb, imgMap); sb.push('</td>');    return }
    }

    // ── draw namespace (images) ─────────────────────────────────────────────
    if (ns === NS.draw) {
      if (local === 'frame') {
        this._childrenToHtml(node, sb, imgMap)
        return
      }
      if (local === 'image') {
        const href = node.getAttributeNS(NS.xlink, 'href') || ''
        // href is like "Pictures/image1.png" — look up in imgMap
        const src  = imgMap[href] ?? imgMap[href.replace(/^\//, '')] ?? ''
        if (src) sb.push(`<img src="${src}" style="max-width:100%;height:auto">`)
        return
      }
    }

    // Anything else — just recurse into children
    this._childrenToHtml(node, sb, imgMap)
  }

  _childrenToHtml(node, sb, imgMap) {
    for (const child of node.childNodes) this._nodeToHtml(child, sb, imgMap)
  }

  _esc(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  destroy() {
    this._imgUrls.forEach(u => URL.revokeObjectURL(u))
    this._imgUrls = []
    super.destroy()
  }
}
