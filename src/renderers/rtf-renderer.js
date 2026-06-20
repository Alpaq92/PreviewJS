import { BaseRenderer } from './base-renderer.js'

export class RTFRenderer extends BaseRenderer {
  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)

    // Dynamic import keeps rtf.js out of the initial bundle
    let RTFJS
    try {
      const mod = await import('rtf.js')
      RTFJS = mod.default ?? mod
    } catch (e) {
      throw new Error(`rtf.js could not be loaded: ${e.message}`)
    }

    if (typeof RTFJS.Document !== 'function') {
      throw new Error('rtf.js: Document constructor not found — check the installed version')
    }

    const doc      = new RTFJS.Document(buffer, { fonts: {}, colorTable: [] })
    const elements = await doc.render()

    container.innerHTML = ''

    const page = document.createElement('div')
    page.className = 'doc-page'
    page.dataset.page = 1

    elements.forEach(el => page.appendChild(el))
    container.appendChild(page)

    this.numPages = 1
  }
}
