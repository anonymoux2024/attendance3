#!/usr/bin/env bash
# Downloads the libraries and face models INTO the app, so the Android app works with no internet at all.
# Usage (from the repository root):   bash scripts/fetch-vendor.sh lecturer     or     bash scripts/fetch-vendor.sh student
# Result: <app>/www/vendor/jsQR.js, face-api.min.js, (lecturer: xlsx.full.min.js) and <app>/www/vendor/models/*
set -euo pipefail
APP="${1:?usage: fetch-vendor.sh lecturer|student}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/$APP/www/vendor"
mkdir -p "$OUT/models"

get() { # get <min-bytes> <output> <url> [<fallback-url>]
  local min="$1" out="$2"; shift 2
  local url
  for url in "$@"; do
    if curl -fsSL --retry 3 --retry-delay 2 "$url" -o "$out" && [ "$(wc -c < "$out")" -ge "$min" ]; then
      echo "ok   $(basename "$out")  <- $url"; return 0
    fi
  done
  echo "FAILED to download $(basename "$out") (tried: $*)" >&2; exit 1
}

get 100000 "$OUT/jsQR.js"          "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js" "https://unpkg.com/jsqr@1.4.0/dist/jsQR.js"
get 500000 "$OUT/face-api.min.js"  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js" "https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js"
if [ "$APP" = "lecturer" ]; then
  get 500000 "$OUT/xlsx.full.min.js" "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js"
fi

W1="https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights"
W2="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"
for f in tiny_face_detector_model-weights_manifest.json face_landmark_68_model-weights_manifest.json face_recognition_model-weights_manifest.json; do
  get 100 "$OUT/models/$f" "$W1/$f" "$W2/$f"
done
for f in tiny_face_detector_model-shard1 face_landmark_68_model-shard1 face_recognition_model-shard1 face_recognition_model-shard2; do
  get 10000 "$OUT/models/$f.bin" "$W1/$f" "$W2/$f"   # saved as .bin so the app serves them as plain files
done

# the manifests name the shard files; point them at the .bin copies
python3 - "$OUT/models" <<'PY'
import glob, json, sys
for p in glob.glob(sys.argv[1] + "/*-weights_manifest.json"):
    data = json.load(open(p))
    for group in data:
        group["paths"] = [x if x.endswith(".bin") else x + ".bin" for x in group["paths"]]
    json.dump(data, open(p, "w"))
    print("manifest updated:", p.split("/")[-1])
PY
echo "Vendor files ready in $OUT"
