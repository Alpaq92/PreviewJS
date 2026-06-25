# Embedding ReaderJS

ReaderJS can be embedded into another app as a **read-only**, **self-contained**,
**same-origin** document viewer. It accepts document **bytes + a filename** (the
filename's extension selects the renderer) — no file picker, no uploads, no
external network requests. The viewer runs inside an **iframe** so its full-page
CSS, JS globals, and CSP surface stay isolated from the host page.

## Build the artifact

```bash
npm install
npm run build:embed     # → dist-embed/
```

Vendor the whole `dist-embed/` folder somewhere **same-origin** on your site,
e.g. `frontend/static/readerjs/`. It is self-contained:

```
dist-embed/
  readerjs.js            # the loader — exposes window.ReaderJS.mount()
  reader.html            # the viewer page (loaded inside the iframe)
  assets/                # lazy per-format chunks + workers (pdf.worker, dejaview)
  rtfjs/                 # RTF.js vendored scripts (RTF)
  libarchive/            # worker-bundle.js + libarchive.wasm (CBR/CBT)
  jsdoc/                 # docToText.js (legacy .doc)
```

All asset URLs are **relative to `reader.html`**, so the folder works from any
path you mount it at.

## Usage

### Option A — JS API (`mount`)

Load the loader, then hand ReaderJS the bytes you already have (e.g. from a
same-origin, cookie-authed `/raw` endpoint):

```html
<script src="/static/readerjs/readerjs.js"></script>
<div id="viewer" style="width:100%; height:80vh"></div>
<script>
  const res  = await fetch('/raw/123', { credentials: 'same-origin' })
  const blob = await res.blob()

  const inst = ReaderJS.mount(document.getElementById('viewer'), {
    blob,                 // or arrayBuffer: <ArrayBuffer>
    name: 'report.pdf',   // REQUIRED — its extension picks the renderer
    mime: blob.type,      // optional
  })

  // inst.load(otherBlob, 'next.docx')   // swap the document at runtime
  // inst.setLang('pl')                  // change UI language
  // inst.destroy()                      // remove the iframe + listeners
</script>
```

The container must have a height (the iframe fills `100%`).

### Option B — iframe with `?src` (zero JS)

Let the iframe fetch the document itself (same-origin, sends cookies):

```html
<iframe src="/static/readerjs/reader.html?src=/raw/123&name=report.pdf"
        style="width:100%; height:80vh; border:0"></iframe>
```

Pass `name` whenever the URL has no usable extension (e.g. `/raw/123`).

## `ReaderJS.mount(container, opts) → instance`

| `opts` field | | |
|---|---|---|
| `blob` / `arrayBuffer` | bytes mode | the document bytes |
| `src` | url mode | same-origin URL the iframe fetches itself |
| `name` | required | filename whose extension selects the renderer |
| `mime` | optional | passed through (dispatch is by extension) |

`instance`: `{ load(blobOrBuffer, name, mime?), setLang(code), destroy(), iframe }`.

Bytes are sent to the iframe as a **structured-clone copy** (your `ArrayBuffer`
is not neutered). The host↔iframe handshake is origin-checked and same-origin only.

## Content-Security-Policy

Everything is same-origin under the vendored folder. The viewer loads:

- `assets/*.js` — lazy per-format engine chunks, incl. `pdf.worker.min.mjs` and the dejaview worker
- `rtfjs/*.js` — RTF.js (RTF documents)
- `libarchive/worker-bundle.js` + `libarchive/libarchive.wasm` — CBR/CBT
- `jsdoc/docToText.js` — legacy `.doc`

Recommended directives for the page hosting the iframe (tighten origins to your host):

```
frame-src   'self';
script-src  'self' 'wasm-unsafe-eval';   # WASM = libarchive (CBR/CBT); no eval otherwise
worker-src  'self' blob:;
connect-src 'self';                       # asset fetches + ?src document fetch
img-src     'self' blob: data:;           # renderers use object/data URLs
style-src   'self' 'unsafe-inline';       # highlight.js injects its theme as <style>; inline el.style
font-src    'self' data:;
```

Two directives are load-bearing: **`'wasm-unsafe-eval'`** (only needed if you use
CBR/CBT) and **`style-src 'unsafe-inline'`** (the dynamically-injected highlight.js
theme + inline `style` attributes). No `'unsafe-eval'` is required.

## Notes

- **Read-only.** No upload UI; the host owns editing.
- **Same-origin.** Vendor `dist-embed/` on your own origin; the iframe relies on
  `allow-same-origin` for workers, WASM, and `localStorage`.
- **Lazy.** Each document pulls only its own engine chunk (a DjVu pulls the
  dejaview chunk, a DOCX pulls mammoth, etc.) — the initial load stays small.
- **Formats:** PDF, DjVu, ODF (ODT/ODS/ODP/ODG), RTF, DOC, DOCX, PPTX,
  XLSX/XLS, CSV/TSV, Markdown, source code, images (+TIFF/EXIF),
  comic archives (CBZ/CBR/CBT), e-books (EPUB/MOBI/AZW3/FB2), plain text.
- See [CREDITS.md](CREDITS.md) — every bundled engine is permissively licensed.
