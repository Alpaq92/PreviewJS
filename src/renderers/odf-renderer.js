import { BaseRenderer } from './base-renderer.js'

const WEBODF_JS  = 'https://cdn.jsdelivr.net/npm/webodf@0.5.10/webodf.js'
const WEBODF_CSS = 'https://cdn.jsdelivr.net/npm/webodf@0.5.10/webodf.css'

export class ODFRenderer extends BaseRenderer {
  constructor() {
    super()
    this._blobUrl = null
    this._iframe  = null
  }

  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)

    const blob = new Blob([buffer], { type: 'application/vnd.oasis.opendocument.text' })
    this._blobUrl = URL.createObjectURL(blob)

    // Render inside an isolated iframe — WebODF rewrites global CSS/fonts
    const iframe = document.createElement('iframe')
    iframe.className = 'odf-frame'
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
    iframe.setAttribute('title', 'ODF document viewer')
    this._iframe = iframe

    container.innerHTML = ''
    container.appendChild(iframe)

    const blobUrl = this._blobUrl
    const iDoc = iframe.contentDocument || iframe.contentWindow.document
    iDoc.open()
    iDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="${WEBODF_CSS}">
  <style>
    html, body { margin:0; padding:0; height:100%; background:#fff; overflow:auto; }
    #odf-canvas { width:100%; height:100%; }
  </style>
</head>
<body>
  <div id="odf-canvas"></div>
  <script src="${WEBODF_JS}"><\/script>
  <script>
    window.addEventListener('load', function() {
      try {
        var canvas = new odf.OdfCanvas(document.getElementById('odf-canvas'));
        canvas.load('${blobUrl}');
      } catch(e) {
        document.body.innerHTML = '<pre style="padding:20px;color:red">WebODF error: ' + e.message + '</pre>';
      }
    });
  <\/script>
</body>
</html>`)
    iDoc.close()

    this.numPages = 1
  }

  async preparePrint() {
    try { this._iframe?.contentWindow?.print() } catch (_) { window.print() }
  }

  destroy() {
    if (this._blobUrl) { URL.revokeObjectURL(this._blobUrl); this._blobUrl = null }
    this._iframe = null
    super.destroy()
  }
}
