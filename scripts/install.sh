#!/bin/sh
# Install the latest autotao release binary.
#
#   curl -fsSL https://raw.githubusercontent.com/agupta/autotao/main/scripts/install.sh | sh
#
# Environment:
#   AUTOTAO_BIN_DIR   where to install (default: $HOME/.local/bin)
#   AUTOTAO_VERSION   install a specific tag instead of the latest (e.g. v0.1.0)
#
# Deliberately POSIX sh, not bash: this is the one file that has to run before
# the user has been told they need bash 4, on whatever /bin/sh the box ships.
# Everything after installation may assume bash 4 — `autotao doctor` and
# scripts/preflight.sh check for it and say so.
set -eu

REPO="agupta/autotao"
BIN_DIR="${AUTOTAO_BIN_DIR:-$HOME/.local/bin}"

die() { printf 'autotao install: %s\n' "$*" >&2; exit 1; }

# --- platform ---------------------------------------------------------------
os=$(uname -s)
arch=$(uname -m)

case "$os" in
  Linux)  os=linux ;;
  Darwin) os=darwin ;;
  *) die "no published binary for $os — build from source: https://github.com/$REPO#build-from-source" ;;
esac

case "$arch" in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) die "no published binary for $arch — build from source: https://github.com/$REPO#build-from-source" ;;
esac

asset="autotao-$os-$arch"

# musl needs a different binary than glibc, and silently installing the glibc
# one produces a confusing "not found" from the dynamic loader.
if [ "$os" = linux ] && [ ! -e /lib/ld-linux-x86-64.so.2 ] && [ ! -e /lib/ld-linux-aarch64.so.1 ]; then
  if [ -e /lib/ld-musl-x86_64.so.1 ] || [ -e /lib/ld-musl-aarch64.so.1 ]; then
    die "this looks like a musl system (Alpine); no musl binary is published yet — build from source: https://github.com/$REPO#build-from-source"
  fi
fi

# --- tools ------------------------------------------------------------------
if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1" -o "$2"; }
  fetch_stdout() { curl -fsSL "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO "$2" "$1"; }
  fetch_stdout() { wget -qO- "$1"; }
else
  die "need curl or wget"
fi

if command -v sha256sum >/dev/null 2>&1; then
  checksum() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
  checksum() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
  die "need sha256sum or shasum to verify the download"
fi

# --- resolve the release ----------------------------------------------------
if [ -n "${AUTOTAO_VERSION:-}" ]; then
  tag="$AUTOTAO_VERSION"
else
  tag=$(fetch_stdout "https://api.github.com/repos/$REPO/releases/latest" \
        | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  [ -n "$tag" ] || die "could not determine the latest release of $REPO"
fi

base="https://github.com/$REPO/releases/download/$tag"
printf 'Installing autotao %s (%s-%s)\n' "$tag" "$os" "$arch"

# --- download and verify ----------------------------------------------------
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

fetch "$base/$asset" "$tmp/$asset" || die "download failed: $base/$asset"
fetch "$base/SHA256SUMS" "$tmp/SHA256SUMS" || die "could not fetch checksums for $tag"

want=$(grep -E "[[:space:]]\*?$asset\$" "$tmp/SHA256SUMS" | cut -d' ' -f1 | head -1)
[ -n "$want" ] || die "SHA256SUMS has no entry for $asset — refusing to install unverified"

got=$(checksum "$tmp/$asset")
if [ "$want" != "$got" ]; then
  printf '  expected %s\n  got      %s\n' "$want" "$got" >&2
  die "checksum mismatch — refusing to install"
fi

chmod +x "$tmp/$asset"
"$tmp/$asset" --version >/dev/null 2>&1 || die "the downloaded binary does not run on this machine"

# --- install ----------------------------------------------------------------
mkdir -p "$BIN_DIR"
# Rename into place: atomic, and it works even when the target is a running
# autotao, because unlinking a busy executable is allowed where writing is not.
mv "$tmp/$asset" "$BIN_DIR/autotao.new"
mv "$BIN_DIR/autotao.new" "$BIN_DIR/autotao"

printf 'Installed %s\n' "$BIN_DIR/autotao"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    printf '\n%s is not on your PATH. Add it:\n' "$BIN_DIR"
    printf '  echo '\''export PATH="%s:$PATH"'\'' >> ~/.profile\n' "$BIN_DIR"
    ;;
esac

printf '\nNext:\n'
printf '  autotao --help\n'
printf '  git clone https://github.com/%s   # the harness, prompts, and rubric\n' "$REPO"
printf '  bash autotao/scripts/preflight.sh  # check this box can run it\n'
