import { BaseRenderer } from './base-renderer.js'

/**
 * Renders CSV / TSV files as an HTML table. Papa Parse (MIT) handles quoting,
 * embedded delimiters and newlines; the first row is shown as a header.
 */
export class CSVRenderer extends BaseRenderer {
  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)
    const Papa = (await import('papaparse')).default

    const text = new TextDecoder('utf-8').decode(buffer)
    const name = viewer?.currentFileName || ''
    const delimiter = /\.tsv$/i.test(name) ? '\t' : ''   // '' = auto-detect
    const rows = Papa.parse(text, { delimiter, skipEmptyLines: true }).data

    container.innerHTML = ''
    const page = document.createElement('div')
    page.className = 'doc-page'
    page.dataset.page = 1

    const table = document.createElement('table')
    table.className = 'data-table'
    rows.forEach((row, i) => {
      const tr = document.createElement('tr')
      row.forEach(cell => {
        const el = document.createElement(i === 0 ? 'th' : 'td')
        el.textContent = cell
        tr.appendChild(el)
      })
      table.appendChild(tr)
    })
    const wrap = document.createElement('div')
    wrap.className = 'data-table-wrap'
    wrap.appendChild(table)
    page.appendChild(wrap)
    container.appendChild(page)

    this.numPages = 1
  }
}
