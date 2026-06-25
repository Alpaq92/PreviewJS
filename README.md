# ReaderJS — Universal Document Viewer

A browser-based document viewer that renders **PDF, ODF, RTF, DOC, DOCX, Markdown, plain text, comic-book archives, and e-books (EPUB/MOBI)** natively in the browser — no server, no upload, no conversion. Everything runs client-side; your files never leave your machine.

To give it a try without installing anything, visit the [live demo](https://alpaq92.github.io/ReaderJS/).

![DOCX viewer screenshot](gallery/docx-viewer.png)

---

## Supported Formats

| Format | Extension(s) | Engine |
|--------|-------------|--------|
| PDF | `.pdf` | PDF.js (Mozilla) |
| ODF — Writer, Calc, Impress | `.odt` `.ods` `.odp` `.odg` | JSZip + DOMParser |
| Rich Text Format | `.rtf` | RTF.js |
| Legacy Word 97–2003 | `.doc` | JSDoc |
| Word Open XML | `.docx` | mammoth.js |
| Markdown | `.md` `.markdown` | marked |
| Plain text | `.txt` `.text` `.log` | native |
| Comic Book Archive | `.cbz` `.cbr` `.cbt` | JSZip (CBZ) + libarchive.js (CBR/CBT) |
| E-book | `.epub` `.mobi` `.azw3` | foliate-js |

## Features

- PDF.js-inspired UI — sidebar thumbnails, page navigation, zoom, print
- Drag & drop or browse to open files
- Client-side only — documents are never uploaded or transmitted

## Running Locally

```bash
git clone --recurse-submodules https://github.com/Alpaq92/ReaderJS.git
cd ReaderJS
npm install
npm run dev
```

## Credits

ReaderJS is built on these open-source libraries:

| Library | Author / Source | Role |
|---------|----------------|------|
| **[PDF.js](https://github.com/mozilla/pdf.js)** | Mozilla Foundation | PDF rendering (via `pdfjs-dist`) |
| **[JSDoc](https://github.com/Alpaq92/JSDoc)** | Alpaq92 | Binary `.doc` (Word 97–2003) reading and rendering — pure JS, zero dependencies, clean-room [MS-CFB] / [MS-DOC] implementation |
| **[mammoth.js](https://github.com/mwilliamson/mammoth.js)** | Michael Williamson | `.docx` (Word Open XML) → HTML conversion |
| **[RTF.js](https://github.com/tbluemel/rtf.js)** | tbluemel | RTF document rendering, including EMFJS and WMFJS for Windows metafile graphics |
| **[JSZip](https://github.com/Stuk/jszip)** | Stuk | ODF / ZIP container reading |
| **[jQuery](https://github.com/jquery/jquery)** | OpenJS Foundation | DOM utility required internally by RTF.js |
| **[marked](https://github.com/markedjs/marked)** | Christopher Jeffrey et al. | Markdown → HTML parsing and rendering |
| **[libarchive.js](https://github.com/nika-begiashvili/libarchivejs)** | Nika Begiashvili | CBR/CBT (RAR/TAR) extraction via a WASM build of libarchive — uses libarchive's own BSD-licensed RAR decoder, no UnRAR code |
| **[foliate-js](https://github.com/johnfactotum/foliate-js)** | John Factotum | EPUB / MOBI / KF8 (AZW3) parsing and paginated rendering |
| **[Vite](https://github.com/vitejs/vite)** | Evan You / Vite contributors | Build tooling and development server |
| **[Material Design Icons](https://pictogrammers.com/library/mdi/)** | Pictogrammers | UI icons (Apache-2.0) |

### Submodules (reference / bundled)

| Submodule | Author / Source | Notes |
|-----------|----------------|-------|
| [mozilla/pdf.js](https://github.com/mozilla/pdf.js) | Mozilla | Pinned for worker build |
| [Alpaq92/JSDoc](https://github.com/Alpaq92/JSDoc) | Alpaq92 | Bundled source for `.doc` rendering |
| [dolanmiu/docx](https://github.com/dolanmiu/docx) | dolanmiu | Reference |
| [webodf/WebODF](https://github.com/webodf/WebODF) | webodf | Reference |
| [tbluemel/rtf.js](https://github.com/tbluemel/rtf.js) | tbluemel | Reference |
| [markedjs/marked](https://github.com/markedjs/marked) | Christopher Jeffrey et al. | Reference |
| [johnfactotum/foliate-js](https://github.com/johnfactotum/foliate-js) | John Factotum | Bundled source for EPUB/MOBI rendering (pinned commit) |

## Gallery

Screenshots are in the [`gallery/`](gallery/) folder.

## License

MIT © 2026 Alpaq92 — see [LICENSE](LICENSE)
