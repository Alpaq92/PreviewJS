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

    let result
    try {
      result = await mammoth.convertToHtml({ arrayBuffer: buffer })
    } catch (err) {
      // mammoth uses JSZip internally; binary .doc files (OLE format) aren't ZIPs
      if (/zip|central directory/i.test(err.message)) {
        throw new Error(
          'Legacy binary .doc format cannot be opened in the browser. ' +
          'Open the file in Word and save it as .docx, then try again.'
        )
      }
      throw err
    }

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
