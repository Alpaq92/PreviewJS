import { BaseRenderer } from './base-renderer.js'

// Map file extension → highlight.js language (subset present in lib/common).
const LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json',
  xml: 'xml', html: 'xml', htm: 'xml',
  yaml: 'yaml', yml: 'yaml',
  css: 'css', scss: 'scss', less: 'less',
  py: 'python', java: 'java', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
  cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
  sh: 'bash', bash: 'bash', sql: 'sql', kt: 'kotlin', swift: 'swift',
  toml: 'ini', ini: 'ini', diff: 'diff',
}

/**
 * Renders source code / config files (JS, TS, JSON, XML, YAML, CSS, Python, …)
 * with highlight.js (BSD-3) syntax highlighting. JSON is pretty-printed.
 */
export class CodeRenderer extends BaseRenderer {
  async load(buffer, container, viewer) {
    await super.load(buffer, container, viewer)
    const hljs = (await import('highlight.js/lib/common')).default
    await import('highlight.js/styles/github.css')   // light theme for the white page

    let text = new TextDecoder('utf-8').decode(buffer)
    const ext = (viewer?.currentFileName || '').split('.').pop().toLowerCase()
    const lang = LANG[ext]

    if (lang === 'json') {
      try { text = JSON.stringify(JSON.parse(text), null, 2) } catch { /* keep raw */ }
    }

    const result = (lang && hljs.getLanguage(lang))
      ? hljs.highlight(text, { language: lang })
      : hljs.highlightAuto(text)

    container.innerHTML = ''
    const page = document.createElement('div')
    page.className = 'doc-page'
    page.dataset.page = 1

    const pre  = document.createElement('pre')
    pre.className = 'code-content'
    const code = document.createElement('code')
    code.className = 'hljs'
    code.innerHTML = result.value   // highlight.js escapes the source text
    pre.appendChild(code)
    page.appendChild(pre)
    container.appendChild(page)

    this.numPages = 1
  }
}
