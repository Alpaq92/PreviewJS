import { BaseRenderer } from './base-renderer.js'

// CHM (.chm) — Microsoft Compiled HTML Help. CHMate parses the ITSF container
// (LZX-decompressing topics) and turns each topic into a sanitized, self-contained
// HTML string. CHM is a legacy *and* an active malware vector, so every topic is
// treated as hostile: rendered in a sandboxed iframe with no scripts, a strict
// CSP, and all resources inlined as blob: URLs — nothing touches the network.

// CHMate's pure topic renderer, lazy-loaded on first open and shared by every
// instance (it carries no per-document state).
let renderTopic = null

export class CHMRenderer extends BaseRenderer {
  constructor() {
    super()
    this._reader = null
    this._blobs = null
    this._frame = null
    this._onFrameClick = this._onFrameClick.bind(this)
  }

  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)

    const [{ ChmReader }, render] = await Promise.all([
      import('chmate'),
      import('chmate/render'),
    ])
    renderTopic = render.renderTopic

    const reader = ChmReader.open(buffer)
    this._reader = reader
    this._blobs = new render.BlobCache(reader)

    container.innerHTML = ''
    const page = document.createElement('div')
    page.className = 'doc-page chm-page'
    page.dataset.page = 1

    // sandbox WITHOUT allow-scripts: topic scripts can never run. allow-same-origin
    // only lets the host measure height and attach the link-navigation handler.
    const frame = document.createElement('iframe')
    frame.className = 'chm-frame'
    frame.sandbox = 'allow-same-origin'
    this._frame = frame
    page.appendChild(frame)
    container.appendChild(page)

    this._buildContents(reader)

    const start = reader.defaultTopic || reader.listFiles().find((p) => /\.html?$/i.test(p))
    if (start) {
      this._navigate(start)
    } else {
      frame.srcdoc = '<!DOCTYPE html><meta charset="utf-8"><body style="font:14px sans-serif;padding:24px;color:#555">This .chm has no displayable HTML topic.</body>'
    }

    this.numPages = 1
  }

  // Render a topic into the iframe and wire link navigation + height sizing.
  _navigate(target, frag = '') {
    const reader = this._reader
    if (!reader) return
    const hash = target.indexOf('#')
    if (hash >= 0) {
      frag = frag || target.slice(hash + 1)
      target = target.slice(0, hash)
    }
    if (!reader.hasFile(target)) return

    const frame = this._frame
    frame.onload = () => {
      const doc = frame.contentDocument
      if (!doc) return
      frame.style.height = `${doc.documentElement.scrollHeight}px`
      doc.addEventListener('click', this._onFrameClick, true)
      if (frag) {
        const el = doc.getElementById(frag) || doc.querySelector(`a[name="${CSS.escape(frag)}"]`)
        if (el) el.scrollIntoView({ block: 'start' })
      }
      this._highlightContents(target)
    }
    frame.srcdoc = renderTopic(reader, target, this._blobs)
  }

  // CHMate marks internal links with data-chm-href and external ones with
  // data-chm-ext (their real href is neutralised to "#"); the host drives both.
  _onFrameClick(e) {
    const a = e.target.closest?.('a')
    if (!a) return
    const internal = a.getAttribute('data-chm-href')
    const external = a.getAttribute('data-chm-ext')
    if (internal) {
      e.preventDefault()
      this._navigate(internal, a.getAttribute('data-chm-frag') || '')
    } else if (external) {
      e.preventDefault()
      if (confirm(`Open external link?\n\n${external}`)) window.open(external, '_blank', 'noopener')
    }
  }

  // ── Table of contents (.hhc) in the sidebar ───────────────────────────────
  _buildContents(reader) {
    const box = document.getElementById('thumbsContent')
    if (!box) return
    const tree = reader.getContents()
    if (!tree?.length) return // leave buildsThumbnailsAsync falsy → "no thumbnails" placeholder
    this.buildsThumbnailsAsync = true // we fill the sidebar ourselves
    box.innerHTML = ''
    const root = document.createElement('div')
    root.className = 'chm-toc'
    this._renderNodes(reader, tree, root)
    box.appendChild(root)
  }

  _renderNodes(reader, nodes, parent) {
    for (const node of nodes) {
      const row = document.createElement('div')
      row.className = 'chm-toc-row'
      row.textContent = node.name || '(untitled)'
      const target = this._nodeTarget(reader, node)
      if (target) {
        row.classList.add('chm-toc-link')
        row.dataset.target = target
        row.addEventListener('click', () => this._navigate(target))
      }
      parent.appendChild(row)
      if (node.children?.length) {
        const kids = document.createElement('div')
        kids.className = 'chm-toc-children'
        this._renderNodes(reader, node.children, kids)
        parent.appendChild(kids)
      }
    }
  }

  // TOC "Local" paths are relative to the contents (.hhc) file's location.
  _nodeTarget(reader, node) {
    if (node.url || !node.local) return null
    const abs = reader.resolvePath(reader.contentsPath || '/', node.local).replace(/#.*$/, '')
    return reader.hasFile(abs) ? abs : null
  }

  _highlightContents(path) {
    const box = document.getElementById('thumbsContent')
    if (!box) return
    box.querySelectorAll('.chm-toc-active').forEach((r) => r.classList.remove('chm-toc-active'))
    box.querySelectorAll(`.chm-toc-row[data-target="${CSS.escape(path)}"]`).forEach((r) => r.classList.add('chm-toc-active'))
  }

  destroy() {
    this._blobs?.revokeAll()
    this._blobs = null
    this._reader = null
    this._frame = null
    const box = document.getElementById('thumbsContent')
    if (box) box.innerHTML = ''
    super.destroy()
  }
}
