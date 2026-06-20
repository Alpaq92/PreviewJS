export class BaseRenderer {
  constructor() {
    this.numPages  = 1
    this.scale     = 1.0
    this.container = null
    this.viewer    = null
  }

  async load(buffer, container, viewer) {
    this.container = container
    this.viewer    = viewer
  }

  scrollToPage(pageNum) {
    const el = this.container?.querySelector(`[data-page="${pageNum}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  setScale(_scale) { this.scale = _scale }

  getPageWidth()  { return null }
  getPageHeight() { return null }

  async preparePrint()  {}
  cleanupAfterPrint()   {}

  destroy() {
    if (this.container) this.container.innerHTML = ''
  }
}
