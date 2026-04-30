$file = "src\components\Inventory.js"
$content = Get-Content $file -Raw
$find = "serial_number || '—'}</td>"
$replace = "serial_number || '—'}</td>`n                      <td className=""hide-mobile"" style={{fontSize:12,color:'var(--c-text2)'}}>{item.color || '—'}</td>"
if ($content -match [regex]::Escape($find)) {
    $content = $content.Replace($find, $replace)
    Set-Content $file $content -NoNewline
    Write-Host "Done! Color cell added."
} else {
    Write-Host "Pattern not found"
}
