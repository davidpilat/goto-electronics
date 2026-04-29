const fs = require('fs')
const file = 'src/components/Inventory.js'
let c = fs.readFileSync(file, 'utf8')
const find = "serial_number || '—'}</td>"
const replace = "serial_number || '—'}</td>\n                      <td class=\"hide-mobile\" style=\"font-size:12px;color:var(--c-text2)\">{item.color || '—'}</td>"
if (c.includes(find)) {
  c = c.replace(find, replace)
  fs.writeFileSync(file, c)
  console.log('Done! Color cell added.')
} else {
  console.log('Pattern not found - already patched or different version')
}
