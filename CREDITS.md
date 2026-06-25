# Credits & Licenses

ReaderJS is MIT-licensed and **permissive-core**: every engine bundled into the
runtime (the app *and* the embeddable build) uses a permissive license
(MIT / BSD / Apache-2.0 / 0BSD / public-domain). There are **no GPL/AGPL/LGPL
dependencies** in anything that ships.

## Runtime engines

| Library | License | Used for |
|---------|---------|----------|
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | Apache-2.0 | PDF rendering |
| [DejaView](https://github.com/Alpaq92/dejaview) | MIT | DjVu decoding/rendering (Web Worker) |
| [mammoth.js](https://github.com/mwilliamson/mammoth.js) | BSD-2-Clause | DOCX → HTML |
| [JSDoc](https://github.com/Alpaq92/JSDoc) | 0BSD | Legacy `.doc` (binary Word) |
| [RTF.js](https://github.com/tbluemel/rtf.js) | MIT | RTF (with EMFJS/WMFJS) |
| [jQuery](https://github.com/jquery/jquery) | MIT | DOM utility required by RTF.js |
| [PptxViewJS](https://github.com/gptsci/pptxviewjs) | **MIT** | PPTX slide rendering |
| [Chart.js](https://github.com/chartjs/Chart.js) | MIT | charts inside PPTX (PptxViewJS dep) |
| [SheetJS](https://sheetjs.com/) (`xlsx`) | Apache-2.0 | XLSX/XLS spreadsheets |
| [Papa Parse](https://www.papaparse.com/) | MIT | CSV/TSV |
| [highlight.js](https://highlightjs.org/) | BSD-3-Clause | source-code highlighting |
| [marked](https://github.com/markedjs/marked) | MIT | Markdown |
| [JSZip](https://github.com/Stuk/jszip) | MIT (dual MIT/GPLv3 — MIT taken) | ODF/CBZ ZIP containers |
| [libarchive.js](https://github.com/nika-begiashvili/libarchivejs) | MIT (bundled libarchive = BSD) | CBR/CBT (RAR/TAR) via WASM |
| [foliate-js](https://github.com/johnfactotum/foliate-js) | MIT | EPUB/MOBI/AZW3/FB2 |
| [UTIF.js](https://github.com/photopea/UTIF.js) | MIT | TIFF images |
| [exifr](https://github.com/MikeKovarik/exifr) | MIT | EXIF/GPS metadata |
| [Vite](https://github.com/vitejs/vite) | MIT | build tooling |
| [Material Design Icons](https://pictogrammers.com/library/mdi/) | Apache-2.0 | UI icons |

## Not shipped

- **WebODF** is present as a git submodule (reference only) and is **AGPL-3.0**.
  It is **never imported or bundled** — ODF files are handled by `odf-renderer.js`
  using JSZip + the browser's `DOMParser`, not WebODF. It does not appear in any
  build output (`dist/` or `dist-embed/`).
