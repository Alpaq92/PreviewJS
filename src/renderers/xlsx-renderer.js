import { BaseRenderer } from './base-renderer.js'

/**
 * Renders spreadsheets (.xlsx / .xls / .xlsm / .xlsb) as HTML tables with
 * SheetJS (Apache-2.0). Each worksheet becomes its own titled table.
 */
export class XLSXRenderer extends BaseRenderer {
  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)
    const XLSX = await import('xlsx')

    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })

    container.innerHTML = ''
    const page = document.createElement('div')
    page.className = 'doc-page'
    page.dataset.page = 1

    const multi = wb.SheetNames.length > 1
    wb.SheetNames.forEach(sheetName => {
      if (multi) {
        const h = document.createElement('h3')
        h.className = 'sheet-title'
        h.textContent = sheetName
        page.appendChild(h)
      }
      const wrap = document.createElement('div')
      wrap.className = 'data-table-wrap'
      // sheet_to_html HTML-escapes cell values; produces a <table>.
      wrap.innerHTML = XLSX.utils.sheet_to_html(wb.Sheets[sheetName])
      const tbl = wrap.querySelector('table')
      if (tbl) tbl.classList.add('data-table')
      page.appendChild(wrap)
    })

    container.appendChild(page)
    this.numPages = 1
  }
}
