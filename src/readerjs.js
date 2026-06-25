// ReaderJS embed loader. Vendor the built folder (dist-embed/) somewhere
// same-origin and load readerjs.js — it exposes `window.ReaderJS.mount()`:
//
//   const inst = ReaderJS.mount(container, { blob | arrayBuffer, name, mime })  // bytes
//   const inst = ReaderJS.mount(container, { src, name })                       // url (iframe self-fetches)
//   inst.load(blob, 'next.pdf')   // swap the document
//   inst.destroy()
//
// mount() embeds reader.html (this file's sibling) in a same-origin iframe and
// hands it the document over postMessage (or via ?src). The iframe isolates the
// viewer's full-page CSS, JS globals and CSP surface from the host page.

// Resolve our own script URL at eval time — an IIFE has no import.meta.url, and
// document.currentScript is only valid during this synchronous top-level run.
const SELF = (document.currentScript && document.currentScript.src) || (() => {
  const s = [...document.getElementsByTagName('script')].reverse()
    .find(el => /readerjs(\.min)?\.js(\?|#|$)/.test(el.src || ''))
  return s ? s.src : location.href
})()

function readerHtmlUrl(opts) {
  const url = new URL('./reader.html', SELF)   // reader.html sits beside readerjs.js
  if (opts.src)  url.searchParams.set('src', opts.src)
  if (opts.name) url.searchParams.set('name', opts.name)
  return url.href
}

export function mount(container, opts = {}) {
  if (!container) throw new Error('ReaderJS.mount: a container element is required')

  const iframe = document.createElement('iframe')
  iframe.src = readerHtmlUrl(opts)
  iframe.title = 'ReaderJS document viewer'
  iframe.style.cssText = 'width:100%;height:100%;border:0;display:block'
  // First-party, same-origin content. allow-same-origin is required for Web
  // Workers, WASM, blob: URLs and localStorage; allow-modals lets the in-frame
  // print dialog open. Top-navigation stays blocked (no allow-top-navigation).
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-modals allow-popups')

  const frameOrigin = new URL(iframe.src, location.href).origin
  let ready = false
  let queued = null   // payload held until the frame reports ready

  const postToFrame = (payload) => iframe.contentWindow.postMessage(payload, frameOrigin)

  function onMessage(e) {
    if (e.source !== iframe.contentWindow || e.origin !== frameOrigin) return
    if (e.data && e.data.type === 'readerjs:ready') {
      ready = true
      if (queued) { postToFrame(queued); queued = null }
    }
  }
  window.addEventListener('message', onMessage)

  // Send bytes to the frame. Structured-clone COPY (no transfer) so the host's
  // own ArrayBuffer is not neutered.
  function load(source, name, mime) {
    Promise.resolve(source instanceof Blob ? source.arrayBuffer() : source).then(buffer => {
      const payload = { type: 'readerjs:load', buffer, name, mime }
      if (ready) postToFrame(payload)
      else queued = payload
    })
  }

  container.appendChild(iframe)

  // Bytes mode queues the document; URL mode is served by reader.html via ?src.
  if (!opts.src && (opts.blob || opts.arrayBuffer)) {
    load(opts.blob || opts.arrayBuffer, opts.name, opts.mime)
  }

  return {
    load,                                  // swap document at runtime (bytes mode)
    setLang(lang) { if (ready) postToFrame({ type: 'readerjs:setLang', lang }) },
    iframe,
    destroy() {
      window.removeEventListener('message', onMessage)
      iframe.remove()
    },
  }
}
