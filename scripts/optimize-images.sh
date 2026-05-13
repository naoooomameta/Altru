#!/usr/bin/env bash
# Convert every a_*.png / a_*.jpg in the repo root to AVIF + WebP siblings.
#
# Prerequisites (macOS):
#   brew install webp libavif
# Prerequisites (Ubuntu / Debian):
#   sudo apt install webp libavif-bin
#
# Output: side-by-side files (e.g. a_FV_Desktop.png -> a_FV_Desktop.webp + a_FV_Desktop.avif).
# Originals are kept so <picture> can fall back for old browsers.
#
# Quality targets:
#   WebP : -q 82 (visually lossless for photos, ~25-35% of PNG size)
#   AVIF : -q 60 (very strong compression, ~10-20% of PNG size, slower encode)

set -euo pipefail

cd "$(dirname "$0")/.."

command -v cwebp   >/dev/null || { echo "cwebp not found. Install: brew install webp"; exit 1; }
command -v avifenc >/dev/null || { echo "avifenc not found. Install: brew install libavif"; exit 1; }

shopt -s nullglob
sources=( a_*.png a_*.jpg )

if [ ${#sources[@]} -eq 0 ]; then
  echo "No a_*.png / a_*.jpg files in repo root."
  exit 0
fi

for src in "${sources[@]}"; do
  stem="${src%.*}"
  webp="${stem}.webp"
  avif="${stem}.avif"

  if [ ! -f "$webp" ] || [ "$src" -nt "$webp" ]; then
    echo "→ WebP: $src"
    cwebp -quiet -q 82 -m 6 "$src" -o "$webp"
  fi

  if [ ! -f "$avif" ] || [ "$src" -nt "$avif" ]; then
    echo "→ AVIF: $src"
    avifenc --min 20 --max 30 -s 4 -j all "$src" "$avif" >/dev/null
  fi
done

echo
echo "Done. Size summary:"
du -ch a_*.png a_*.jpg a_*.webp a_*.avif 2>/dev/null \
  | awk '/total/ {next} {by_ext[gensub(/.*\./,"",1,$2)] += $1+0; cnt[gensub(/.*\./,"",1,$2)]++} END {for (e in by_ext) printf "  %-5s %4d files  %6.1f MB\n", e, cnt[e], by_ext[e]/1024}'
