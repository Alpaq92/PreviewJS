// Flatten an element to text, inserting a newline at each block boundary — plain
// textContent collapses every paragraph onto one line. `block` is the set of tag
// names that end a line; `skip` (optional) is dropped entirely (e.g. SCRIPT/STYLE).
export function flattenBlocks(root, block, skip) {
  let out = ''
  const walk = node => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += child.nodeValue
      else if (child.nodeType === 1) {
        const tag = child.tagName?.toUpperCase()
        if (tag === 'BR') { out += '\n'; continue }
        if (skip?.has(tag)) continue
        walk(child)
        if (block.has(tag)) out += '\n'
      }
    }
  }
  walk(root)
  return out
}
