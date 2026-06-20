import { BaseRenderer } from './base-renderer.js'

export class DOCXRenderer extends BaseRenderer {
  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)

    let mammoth
    try {
      const mod = await import('mammoth')
      mammoth = mod.default ?? mod
    } catch (e) {
      throw new Error(`mammoth could not be loaded: ${e.message}`)
    }

    const result = await mammoth.convertToHtml({ arrayBuffer: buffer })

    if (result.messages?.length) {
      console.warn('[DOCX] conversion messages:', result.messages)
    }

    container.innerHTML = ''

    const page = document.createElement('div')
    page.className = 'doc-page'
    page.dataset.page = 1
    page.innerHTML = result.value
    container.appendChild(page)

    this.numPages = 1
  }
}
