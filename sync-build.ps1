# sync-build.ps1
#
# Copies a fresh Vite build from app\dist up to the repository root, which is
# what GitHub Pages actually serves.
#
# Why this exists: `npx vite build --mode root` writes to app\dist, but Pages
# publishes the repo root. Without this step the build sits in dist and
# `git add -A` sees nothing to commit, so the site keeps serving the old bundle.
#
# Usage, from the repository root:
#     powershell -ExecutionPolicy Bypass -File .\sync-build.ps1
#
# Run it AFTER:  cd app ; npx vite build --mode root ; cd ..
#
# NOTE: this file is deliberately pure ASCII. Windows PowerShell 5.1 reads
# .ps1 files as ANSI, so any curly quote or em-dash gets mangled into bytes it
# cannot parse. Where a non-ASCII character is genuinely needed (the page title
# contains an em-dash) it is built with [char]0x2014 instead of being typed.

$ErrorActionPreference = 'Stop'

if (-not (Test-Path 'dist/index.html')) {
    Write-Error "dist/index.html not found. Run 'cd app; npx vite build --mode root; cd ..' first."
}
if (-not (Test-Path 'assets')) {
    Write-Error "assets folder not found. Run this from the repository root."
}

Write-Host 'Clearing previous bundle files...' -ForegroundColor Cyan
# Only the hashed build output. Product photography and fonts are NOT touched.
Get-ChildItem assets -File |
    Where-Object { $_.Name -match '^(index-.*\.(js|css)|.*Page-.*\.js|.*Section-.*\.js|.*Banner-.*\.js|.*Showcase-.*\.js|vendor-.*\.js|rolldown-runtime-.*\.js|ClerkBoundary-.*\.js|portal-.*\.css)$' } |
    Remove-Item -Force

Write-Host 'Copying build output to repo root...' -ForegroundColor Cyan
Copy-Item 'dist/index.html' '.' -Force
Copy-Item 'dist/404.html'   '.' -Force -ErrorAction SilentlyContinue
Copy-Item 'dist/assets/*.js'  'assets/' -Force
Copy-Item 'dist/assets/*.css' 'assets/' -Force

# WebP variants: products ship inside dist/assets/products, artisan and hero
# art lives under img/. Copy both so picture sources resolve in production.
if (Test-Path 'dist/assets/products') {
    New-Item -ItemType Directory -Force -Path 'assets/products' | Out-Null
    Copy-Item 'dist/assets/products/*.webp' 'assets/products/' -Force -ErrorAction SilentlyContinue
}
Copy-Item 'dist/assets/*.webp' 'assets/' -Force -ErrorAction SilentlyContinue

if (Test-Path 'app/public/img/artisans') {
    New-Item -ItemType Directory -Force -Path 'img/artisans' | Out-Null
    Copy-Item 'app/public/img/artisans/*' 'img/artisans/' -Force -Recurse -ErrorAction SilentlyContinue
}

# category.html -----------------------------------------------------------
# GitHub Pages serves files, not client routes, so /hunarlink/category/<slug>
# needs its own entry point carrying the slug in a base href. Regenerating it
# here keeps it in lockstep with the bundle hash instead of drifting a build
# behind, which is how the category pages broke once before.
Write-Host 'Regenerating category.html...' -ForegroundColor Cyan
$emDash = [char]0x2014
$oldTitle = "HunarLink $emDash GI-Certified Kashmiri Handicrafts Marketplace"
$newTitle = "HunarLink $emDash Craft Categories`r`n    <base href=`"/hunarlink/category/`">"

$src = Get-Content 'dist/index.html' -Raw
if ($src.Contains($oldTitle)) {
    $src = $src.Replace($oldTitle, $newTitle)
    Set-Content 'category.html' $src -NoNewline -Encoding UTF8
    Write-Host '  category.html regenerated' -ForegroundColor Green
} else {
    Write-Warning '  title not found in dist/index.html - copying it unchanged instead'
    Copy-Item 'dist/index.html' 'category.html' -Force
}

# ---------------------------------------------------------------------------
# Report what changed, so it is obvious whether there is anything to commit.
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host 'Bundle now referenced by root index.html:' -ForegroundColor Green
$m = Select-String -Path 'index.html' -Pattern 'assets/index-[A-Za-z0-9_-]+\.js' -AllMatches
foreach ($hit in $m.Matches) { Write-Host ('  ' + $hit.Value) -ForegroundColor Green }

Write-Host ''
Write-Host 'Git status:' -ForegroundColor Yellow
git status --short

Write-Host ''
Write-Host 'Done. If the status above shows changes, commit and push them:' -ForegroundColor Cyan
Write-Host '   git add -A'
Write-Host '   git commit -m "Rebuild with Clerk key so the OAuth buttons render"'
Write-Host '   git push'
