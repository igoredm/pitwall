# Regenera as partes do site que vêm do app: o widget/configurações de demonstração (site/demo) e as fontes.
#   powershell -ExecutionPolicy Bypass -File site/build.ps1
# Precisa do Node (o mesmo do web/) e de `npm ci` já rodado em web/.
$ErrorActionPreference = 'Stop'
$site = $PSScriptRoot
$root = Split-Path $site -Parent
$web = Join-Path $root 'web'
$tmp = Join-Path $site '.demo-build'

# 1. Build do Angular com base relativa (o site pode morar em qualquer pasta), numa saída separada:
#    não mexe em web/dist, que é o que vai para o app.
Push-Location $web
try {
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  & npx ng build --configuration production --base-href ./ --output-path $tmp
  if ($LASTEXITCODE -ne 0) { throw "ng build falhou ($LASTEXITCODE)" }
} finally { Pop-Location }

# 2. site/demo = o build (index.html, chunks, fontes do widget)
$demo = Join-Path $site 'demo'
if (Test-Path $demo) { Remove-Item -Recurse -Force $demo }
Copy-Item -Recurse (Join-Path $tmp 'browser') $demo
Remove-Item -Recurse -Force $tmp
# a demo não deve ser indexada como página própria
$idx = Join-Path $demo 'index.html'
$html = [IO.File]::ReadAllText($idx)
if ($html -notmatch 'name="robots"') {
  $html = $html.Replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="robots" content="noindex">')
  [IO.File]::WriteAllText($idx, $html, (New-Object Text.UTF8Encoding $false))
}

# 3. Fontes do site (as mesmas do app, servidas localmente)
$fonts = Join-Path $site 'assets\fonts'
New-Item -ItemType Directory -Force $fonts | Out-Null
$src = Join-Path $web 'node_modules\@fontsource'
foreach ($w in 200, 400, 600, 700, 800) { Copy-Item (Join-Path $src "manrope\files\manrope-latin-$w-normal.woff2") $fonts -Force }
foreach ($w in 400, 500) { Copy-Item (Join-Path $src "jetbrains-mono\files\jetbrains-mono-latin-$w-normal.woff2") $fonts -Force }

$size = (Get-ChildItem -Recurse -File $site | Measure-Object Length -Sum).Sum
Write-Host ("site/ pronto: {0:N1} MB" -f ($size / 1MB))
