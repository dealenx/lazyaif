#!/usr/bin/env sh
# lazyaif installer (unix: macOS + Linux)
# Usage: curl -fsSL https://raw.githubusercontent.com/dealenx/lazyaif/main/scripts/install.sh | sh
#   LAZYAIF_INSTALL_DIR=/path  custom install dir (default: ~/.local/bin)
#   LAZYAIF_INSTALL_DEBUG=1     enable verbose (set -x) output
#   GITHUB_API_TOKEN=xxx       optional token to avoid rate limits
# Exit codes: 0 ok · 2 unsupported · 3 checksum · 4 download · 5 api

set -eu

REPO="dealenx/lazyaif"
INSTALL_DIR="${LAZYAIF_INSTALL_DIR:-$HOME/.local/bin}"
DEBUG="${LAZYAIF_INSTALL_DEBUG:-}"

if [ -n "$DEBUG" ]; then
  set -x
fi

log() { echo "[install] $*"; }
err() { echo "[install:error] $*" >&2; }

# --- 1. Banner --------------------------------------------------------------
log "lazyaif installer (unix)"

# --- 2. Detect OS + arch ----------------------------------------------------
os_raw="$(uname -s)"
arch_raw="$(uname -m)"

case "$os_raw" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *) err "unsupported OS: $os_raw (expected Darwin or Linux)"; exit 2 ;;
esac

case "$arch_raw" in
  x86_64|amd64) arch="x64" ;;
  aarch64|arm64) arch="arm64" ;;
  *) err "unsupported arch: $arch_raw (expected x86_64 or aarch64)"; exit 2 ;;
esac

log "detected os=$os arch=$arch"

# --- 3. Resolve install dir ------------------------------------------------
mkdir -p "$INSTALL_DIR"
log "install dir: $INSTALL_DIR"

# --- 4. Fetch latest release metadata --------------------------------------
api_url="https://api.github.com/repos/$REPO/releases/latest"
api_headers=""
if [ -n "${GITHUB_API_TOKEN:-}" ]; then
  api_headers="-H \"Authorization: Bearer $GITHUB_API_TOKEN\""
fi

log "fetching latest release: $api_url"
api_resp="$(curl -fsSL $api_headers -H "User-Agent: lazyaif-installer" "$api_url")" || {
  err "failed to fetch release metadata from $api_url"
  exit 5
}

# Extract tag_name (first occurrence)
tag_name="$(echo "$api_resp" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
if [ -z "$tag_name" ]; then
  err "could not parse tag_name from API response"
  exit 5
fi
log "latest tag: $tag_name"

# Expected asset name: lazyaif-<tag>-<os>-<arch>  (no extension on unix)
asset_name="lazyaif-$tag_name-$os-$arch"
checksums_name="checksums.txt"

# --- 5. Parse asset download URLs -------------------------------------------
# Extract browser_download_url for a given asset name from the GitHub API JSON.
# The JSON has nested objects (uploader, etc.) so [^}]* breaks. We use awk to
# find the asset name, then scan forward for the next browser_download_url.
extract_url() {
  _asset="$1"
  echo "$api_resp" | awk -v want="$_asset" '
    {
      gsub(/,/, "\n")
    }
    /"name"[[:space:]]*:[[:space:]]*"/ {
      match($0, /"name"[[:space:]]*:[[:space:]]*"([^"]*)"/, a)
      if (a[1] == want) found = 1
    }
    found && /"browser_download_url"[[:space:]]*:[[:space:]]*"/ {
      match($0, /"browser_download_url"[[:space:]]*:[[:space:]]*"([^"]*)"/, b)
      print b[1]
      exit
    }
  ' | head -n1
}

log "looking for asset: $asset_name"
bin_url="$(extract_url "$asset_name")"

if [ -z "$bin_url" ]; then
  err "asset not found in release: $asset_name"
  err "available assets:"
  echo "$api_resp" | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/  \1/' >&2
  exit 4
fi
log "binary url: $bin_url"

log "looking for: $checksums_name"
checksums_url="$(extract_url "$checksums_name")"

if [ -z "$checksums_url" ]; then
  err "checksums.txt not found in release"
  exit 4
fi
log "checksums url: $checksums_url"

# --- 6. Download binary + checksums ----------------------------------------
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
log "temp dir: $tmpdir"

tmp_bin="$tmpdir/$asset_name"
tmp_checksums="$tmpdir/$checksums_name"

log "downloading binary..."
curl -fsSL -H "User-Agent: lazyaif-installer" -o "$tmp_bin" "$bin_url" || {
  err "failed to download binary from $bin_url"
  exit 4
}
log "downloaded: $(ls -la "$tmp_bin" | awk '{print $5}') bytes"

log "downloading checksums..."
curl -fsSL -H "User-Agent: lazyaif-installer" -o "$tmp_checksums" "$checksums_url" || {
  err "failed to download checksums from $checksums_url"
  exit 4
}

# --- 7. Verify SHA-256 -----------------------------------------------------
expected_hash="$(grep -E "[[:space:]]+\.?/?$asset_name\$" "$tmp_checksums" | awk '{print $1}' | head -n1)"
if [ -z "$expected_hash" ]; then
  err "no checksum found for $asset_name in checksums.txt"
  err "contents:"
  cat "$tmp_checksums" >&2
  exit 3
fi
log "expected sha256: $expected_hash"

# Detect hash tool
if command -v sha256sum >/dev/null 2>&1; then
  actual_hash="$(sha256sum "$tmp_bin" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual_hash="$(shasum -a 256 "$tmp_bin" | awk '{print $1}')"
else
  err "no sha256sum or shasum available for verification"
  exit 3
fi
log "actual sha256:   $actual_hash"

if [ "$actual_hash" != "$expected_hash" ]; then
  err "checksum mismatch!"
  err "expected: $expected_hash"
  err "actual:   $actual_hash"
  exit 3
fi
log "checksum verified"

# --- 8. Install ------------------------------------------------------------
dest="$INSTALL_DIR/lazyaif"
mv "$tmp_bin" "$dest"
chmod +x "$dest"
log "installed: $dest"

# --- 9. Confirm + PATH hint -------------------------------------------------
"$dest" --version || err "warning: binary launched but --version failed"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo
    log "NOTE: $INSTALL_DIR is not on your PATH."
    echo "  Add it with:"
    if [ -n "${ZSH_VERSION:-}" ]; then
      echo "    echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc"
    else
      echo "    echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.bashrc"
    fi
    ;;
esac

echo
log "done. Run \`lazyaif --help\` to get started."