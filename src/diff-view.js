// Compare view — diffs two text representations with jsdiff and renders the
// result three ways (side-by-side / unified / inline) from a single row model.
// Each changed line is hoverable; the tooltip can be pinned and shows blame
// data (author/date/commit/message) the host supplies, keyed by new-side line.
import * as Diff from 'diff'
import { t } from './i18n.js'

/* ── Row model ─────────────────────────────────────────────────────────────
 * Row = { type:'equal'|'add'|'del'|'mod', leftLineNo, rightLineNo, leftText, rightText }
 * blame is keyed by rightLineNo (the new revision's line). One Diff.diffLines()
 * call feeds all three view modes. */

function splitLines(value) {
  const lines = value.split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()  // drop trailing empty
  return lines
}

function buildRows(leftText, rightText) {
  const parts = Diff.diffLines(leftText ?? '', rightText ?? '')
  const rows = []
  let lL = 0, rL = 0          // 1-based line counters (left / right)
  let pendingDel = []         // [{ text, lineNo }] removed lines awaiting pairing

  const spillDels = () => {
    for (const d of pendingDel)
      rows.push({ type: 'del', leftLineNo: d.lineNo, rightLineNo: null, leftText: d.text, rightText: '' })
    pendingDel = []
  }

  for (const part of parts) {
    const lines = splitLines(part.value)
    if (part.removed) {
      for (const text of lines) { lL++; pendingDel.push({ text, lineNo: lL }) }
    } else if (part.added) {
      const added = lines.map(text => { rL++; return { text, lineNo: rL } })
      const n = Math.min(pendingDel.length, added.length)   // pair del+add as 'mod'
      for (let i = 0; i < n; i++)
        rows.push({ type: 'mod', leftLineNo: pendingDel[i].lineNo, rightLineNo: added[i].lineNo,
                    leftText: pendingDel[i].text, rightText: added[i].text })
      for (let i = n; i < pendingDel.length; i++)            // leftover removals
        rows.push({ type: 'del', leftLineNo: pendingDel[i].lineNo, rightLineNo: null,
                    leftText: pendingDel[i].text, rightText: '' })
      for (let i = n; i < added.length; i++)                 // leftover additions
        rows.push({ type: 'add', leftLineNo: null, rightLineNo: added[i].lineNo,
                    leftText: '', rightText: added[i].text })
      pendingDel = []
    } else {
      spillDels()
      for (const text of lines) { lL++; rL++; rows.push({ type: 'equal', leftLineNo: lL, rightLineNo: rL, leftText: text, rightText: text }) }
    }
  }
  spillDels()
  return rows
}

// Intra-line word diff for 'mod' rows (memoized). diffWordsWithSpace keeps
// whitespace so re-indentation and table cells (tab-separated) line up.
function wordParts(row) {
  if (!row._wp) row._wp = Diff.diffWordsWithSpace(row.leftText, row.rightText)
  return row._wp
}

// Fill `el` with `text`. With word-diff `parts`, wrap added/removed runs; `side`
// 'left' drops additions, 'right' drops removals, 'inline' keeps both.
function fillText(el, text, parts, side) {
  if (!parts) { el.textContent = text; return }
  for (const p of parts) {
    if (side === 'left' && p.added) continue
    if (side === 'right' && p.removed) continue
    if (p.added)        { const n = document.createElement('ins'); n.textContent = p.value; el.appendChild(n) }
    else if (p.removed) { const n = document.createElement('del'); n.textContent = p.value; el.appendChild(n) }
    else                  el.appendChild(document.createTextNode(p.value))
  }
}

function markChange(el, row) { el.classList.add('diff-change'); el._row = row }

/* ── View renderers (all consume the same rows[]) ──────────────────────────── */

function sideClass(row, side) {
  const lineNo = side === 'left' ? row.leftLineNo : row.rightLineNo
  if (lineNo == null) return 'blank'
  if (row.type === 'equal') return 'equal'
  return side === 'left' ? 'del' : 'add'   // del/mod-left = red, add/mod-right = green
}

function cell(row, side) {
  const c = document.createElement('div')
  c.className = 'diff-cell ' + sideClass(row, side)
  const ln = document.createElement('span'); ln.className = 'diff-lineno'
  const txt = document.createElement('span'); txt.className = 'diff-text'
  const lineNo = side === 'left' ? row.leftLineNo : row.rightLineNo
  if (lineNo == null) { c.classList.add('diff-blank') }
  else {
    ln.textContent = lineNo
    fillText(txt, side === 'left' ? row.leftText : row.rightText, row.type === 'mod' ? wordParts(row) : null, side)
    if (row.type !== 'equal') markChange(c, row)
  }
  c.append(ln, txt)
  return c
}

function renderSideBySide(body, rows) {
  const grid = document.createElement('div')
  grid.className = 'diff-rows side-by-side'
  for (const row of rows) grid.append(cell(row, 'left'), cell(row, 'right'))
  body.appendChild(grid)
}

function uLine(row, kind) {   // kind: 'equal' | 'del' | 'add'
  const line = document.createElement('div')
  line.className = 'diff-line ' + kind
  const lo = document.createElement('span'); lo.className = 'diff-lineno old'
  const ln = document.createElement('span'); ln.className = 'diff-lineno new'
  const sign = document.createElement('span'); sign.className = 'diff-sign'
  const txt = document.createElement('span'); txt.className = 'diff-text'
  const wp = row.type === 'mod' ? wordParts(row) : null
  if (kind === 'equal') { lo.textContent = row.leftLineNo; ln.textContent = row.rightLineNo; txt.textContent = row.leftText }
  else if (kind === 'del') { lo.textContent = row.leftLineNo; sign.textContent = '−'; fillText(txt, row.leftText, wp, 'left'); markChange(line, row) }
  else { ln.textContent = row.rightLineNo; sign.textContent = '+'; fillText(txt, row.rightText, wp, 'right'); markChange(line, row) }
  line.append(lo, ln, sign, txt)
  return line
}

function renderUnified(body, rows) {
  const col = document.createElement('div')
  col.className = 'diff-rows unified'
  for (const row of rows) {
    if (row.type === 'mod') { col.append(uLine(row, 'del'), uLine(row, 'add')) }
    else col.appendChild(uLine(row, row.type))
  }
  body.appendChild(col)
}

function renderInline(body, rows) {
  const col = document.createElement('div')
  col.className = 'diff-rows inline'
  for (const row of rows) {
    const line = document.createElement('div')
    line.className = 'diff-line ' + row.type
    if (row.type === 'equal') line.textContent = row.leftText
    else if (row.type === 'del') { const d = document.createElement('del'); d.textContent = row.leftText; line.appendChild(d); markChange(line, row) }
    else if (row.type === 'add') { const i = document.createElement('ins'); i.textContent = row.rightText; line.appendChild(i); markChange(line, row) }
    else { fillText(line, '', wordParts(row), 'inline'); markChange(line, row) }
    col.appendChild(line)
  }
  body.appendChild(col)
}

const RENDERERS = { 'side-by-side': renderSideBySide, unified: renderUnified, inline: renderInline }

/* ── Public entry ──────────────────────────────────────────────────────────── */

export function renderCompare(target, { leftText, rightText, blame = {}, mode = 'side-by-side' } = {}) {
  const rows = buildRows(leftText, rightText)
  target.innerHTML = ''
  target.classList.add('diff-view')

  // mode toggle (segmented control)
  const toggle = document.createElement('div')
  toggle.className = 'diff-mode-toggle'
  const btns = {}
  for (const [m, key] of [['side-by-side', 'compare.modeSideBySide'], ['unified', 'compare.modeUnified'], ['inline', 'compare.modeInline']]) {
    const b = document.createElement('button')
    b.className = 'diff-mode-btn'; b.dataset.mode = m; b.dataset.i18n = key; b.textContent = t(key)
    b.addEventListener('click', () => setMode(m))
    toggle.appendChild(b); btns[m] = b
  }

  const bodyWrap = document.createElement('div')   // position:relative anchor for tooltips/pins
  bodyWrap.className = 'diff-body'
  target.append(toggle, bodyWrap)

  // transient hover tooltip (with a pin button) + persistent pins
  const tip = document.createElement('div'); tip.className = 'diff-tooltip hidden'
  const tipHead = document.createElement('div'); tipHead.className = 'diff-tip-head'
  const pinBtn = document.createElement('button'); pinBtn.className = 'diff-pin-btn'; pinBtn.textContent = '📌'
  pinBtn.dataset.i18nTitle = 'compare.pin'; pinBtn.title = t('compare.pin')
  pinBtn.addEventListener('click', e => { e.stopPropagation(); if (tip._row && tip._anchor) pinTooltip(tip._row, tip._anchor) })
  tipHead.appendChild(pinBtn)
  const tipBody = document.createElement('div'); tipBody.className = 'diff-tip-body'
  tip.append(tipHead, tipBody)
  bodyWrap.appendChild(tip)
  const pins = []

  function fillBlame(host, row) {
    host.innerHTML = ''
    const h = document.createElement('h3'); h.dataset.i18n = 'blame.heading'; h.textContent = t('blame.heading'); host.appendChild(h)
    const data = row.rightLineNo != null ? blame[row.rightLineNo] : null
    if (data) {
      const dl = document.createElement('dl')
      for (const k of ['author', 'date', 'commit', 'message']) {
        if (data[k] == null || data[k] === '') continue
        const dt = document.createElement('dt'); dt.dataset.i18n = 'blame.' + k; dt.textContent = t('blame.' + k)
        const dd = document.createElement('dd'); dd.textContent = data[k]
        dl.append(dt, dd)
      }
      host.appendChild(dl)
    } else {
      const note = document.createElement('p'); note.className = 'diff-tip-note'
      const key = row.rightLineNo == null ? 'compare.removed' : 'compare.noBlame'
      note.dataset.i18n = key; note.textContent = t(key); host.appendChild(note)
    }
  }

  function position(el, anchor) {
    const b = bodyWrap.getBoundingClientRect()
    const a = anchor.getBoundingClientRect()
    el.style.top = (a.bottom - b.top + 4) + 'px'
    el.style.left = Math.max(4, Math.min(a.left - b.left, bodyWrap.clientWidth - el.offsetWidth - 8)) + 'px'
  }

  function pinTooltip(row, anchor) {
    const pin = document.createElement('div'); pin.className = 'diff-pin'
    const head = document.createElement('div'); head.className = 'diff-tip-head'
    const close = document.createElement('button'); close.className = 'diff-pin-close'; close.textContent = '✕'
    close.dataset.i18nTitle = 'compare.unpin'; close.title = t('compare.unpin')
    close.addEventListener('click', () => { pin.remove(); const i = pins.indexOf(pin); if (i >= 0) pins.splice(i, 1) })
    head.appendChild(close)
    const pb = document.createElement('div'); pb.className = 'diff-tip-body'; fillBlame(pb, row)
    pin.append(head, pb); bodyWrap.appendChild(pin); position(pin, anchor); pins.push(pin); hideTip()
  }

  let hideTimer = null
  const hideTip = () => tip.classList.add('hidden')
  function showTipFor(el) {
    clearTimeout(hideTimer)
    tip._row = el._row; tip._anchor = el
    fillBlame(tipBody, el._row)
    tip.classList.remove('hidden')
    position(tip, el)
  }
  const scheduleHide = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hideTip, 180) }

  bodyWrap.addEventListener('mouseover', e => { const el = e.target.closest('.diff-change'); if (el && el._row) showTipFor(el) })
  bodyWrap.addEventListener('mouseout', e => { if (e.target.closest('.diff-change')) scheduleHide() })
  tip.addEventListener('mouseenter', () => clearTimeout(hideTimer))
  tip.addEventListener('mouseleave', scheduleHide)

  let current = RENDERERS[mode] ? mode : 'side-by-side'
  function render() {
    [...bodyWrap.children].forEach(c => { if (c !== tip) c.remove() })
    pins.splice(0).forEach(p => p.remove())   // re-render invalidates anchors
    hideTip()
    RENDERERS[current](bodyWrap, rows)
    for (const m in btns) btns[m].classList.toggle('active', m === current)
  }
  function setMode(m) { if (RENDERERS[m]) { current = m; render() } }

  render()

  return {
    setMode,
    destroy() {
      pins.splice(0).forEach(p => p.remove())
      tip.remove()
      target.innerHTML = ''
      target.classList.remove('diff-view')
    },
  }
}
