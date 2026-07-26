#!/usr/bin/env bash
# Fetch a paper into the local cache — and FLAG LOUDLY when it can't be fetched.
#
# The failure mode this exists to prevent: on 2026-07-25 three consecutive
# attempts failed to get arXiv:2410.22842, concluded "the arXiv API is dead",
# and that misdiagnosis was written into a problem file as external
# fact. It sat there for two days. The real causes were (a) the harness denying
# runs WebFetch/WebSearch and (b) export.arxiv.org answering http:// with a 301
# and an empty body. Neither is "arXiv is down", and nothing surfaced the
# failure for a human to look at.
#
# So: every attempt is recorded in papers/INDEX.tsv, success or failure, and a
# failure additionally lands in papers/WANTED.md where the supervision console
# shows it until someone deals with it.
#
#   scripts/fetch-paper.sh arXiv:2410.22842 "P13-free ladder method"
#   scripts/fetch-paper.sh 2410.22842
#   scripts/fetch-paper.sh 10.1007/s00039-014-0251-1 "GAFA integral geometry"
#   scripts/fetch-paper.sh doi:10.4007/annals.2015.182.2.7
#   scripts/fetch-paper.sh https://example.org/paper.pdf "title or reason"
#
# Cached as papers/<key>.pdf plus papers/<key>.txt (pdftotext), so a run can
# grep the text without a PDF reader — and so a NETWORK-BLOCKED run (any
# bench-*) can still read a paper an operator cached earlier.
#
# Resolver order:
#   1. direct URL (arxiv pdf, bare https, doi.org)
#   2. open-access locators (Unpaywall, OpenAlex, Semantic Scholar)
#   3. institutional access — NOT shipped; see the stub near the end of this file
# Prefer this script over raw curl. On failure: flag WANTED and continue —
# never diagnose the publisher/source in problem files.
set -uo pipefail
cd "$(dirname "$0")/.."
P=papers; mkdir -p "$P"
INDEX="$P/INDEX.tsv"
WANTED="$P/WANTED.md"
[[ -s "$INDEX" ]] || printf 'key\tstatus\turl\tbytes\tsha256\tfetched_at\tnote\n' > "$INDEX"

REF="${1:-}"; NOTE="${2:-}"
[[ -n "$REF" ]] || { echo "usage: $0 <arXiv-id|doi|url> [note]" >&2; exit 2; }

# Browser user-agent. Some scholarly sites answer default curl/python agents with a
# 403 — erdosproblems.com is the one this repo hit — while serving the same public
# page to a browser. This is for reading public pages a person could open by hand,
# one at a time, on a human's behalf. It is not a rate-limit or paywall bypass: keep
# fetches occasional, respect robots.txt and any site's stated terms, and if a source
# asks you not to script against it, don't.
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
OA_MAIL="${UNPAYWALL_EMAIL:-papers@localhost}"

# ---- normalise to cache key --------------------------------------------------
DOI=""
ARXIV_RE='^(arXiv:|arxiv:)?([0-9]{4}\.[0-9]{4,5})(v[0-9]+)?$'
DOI_RE='^([Dd][Oo][Ii]:)?(10\.[0-9]{4,9}/[-._;()/:A-Za-z0-9]+)$'
if [[ "$REF" =~ $ARXIV_RE ]]; then
  KEY="arxiv-${BASH_REMATCH[2]}"; URL="https://arxiv.org/pdf/${BASH_REMATCH[2]}"
elif [[ "$REF" =~ arxiv\.org/(abs|pdf)/([0-9]{4}\.[0-9]{4,5}) ]]; then
  KEY="arxiv-${BASH_REMATCH[2]}"; URL="https://arxiv.org/pdf/${BASH_REMATCH[2]}"
elif [[ "$REF" =~ $DOI_RE ]]; then
  DOI="${BASH_REMATCH[2]}"
  KEY=$(printf 'doi-%s' "$DOI" | tr '/:' '--' | tr -c 'A-Za-z0-9._-' '-' | cut -c1-80)
  URL="https://doi.org/${DOI}"
elif [[ "$REF" =~ doi\.org/(10\.[^[:space:]]+) ]]; then
  DOI="${BASH_REMATCH[1]}"; DOI="${DOI%%\?*}"
  KEY=$(printf 'doi-%s' "$DOI" | tr '/:' '--' | tr -c 'A-Za-z0-9._-' '-' | cut -c1-80)
  URL="https://doi.org/${DOI}"
else
  KEY=$(printf '%s' "$REF" | tr -c 'A-Za-z0-9._-' '-' | cut -c1-60); URL="$REF"
  if [[ "$REF" =~ (10\.[0-9]{4,9}/[-._;()/:A-Za-z0-9]+) ]]; then DOI="${BASH_REMATCH[1]}"; fi
fi

FINAL_URL="$URL"

record(){ # record <status> <bytes> <sha> <note>
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$KEY" "$1" "${FINAL_URL:-$URL}" "$2" "$3" "$(date -u +%FT%TZ)" "$4" >> "$INDEX"
}

flag_wanted(){ # flag_wanted <reason>
  grep -qF "| $KEY |" "$WANTED" 2>/dev/null && return 0
  [[ -s "$WANTED" ]] || cat > "$WANTED" <<'HDR'
# WANTED — papers a run needed and could not fetch

The supervision console surfaces every open row here. Clear a row by running
`scripts/fetch-paper.sh <ref>` successfully, then deleting the line.

**Never record a fetch failure as a fact about the source.** A run that cannot
reach the network is describing its own sandbox, not the internet.

| key | ref | reason wanted | failure | first flagged |
|---|---|---|---|---|
HDR
  printf '| %s | %s | %s | %s | %s |\n' \
    "$KEY" "${DOI:-$URL}" "${NOTE:-(unstated)}" "$1" "$(date -u +%F)" >> "$WANTED"
  echo "FLAGGED in $WANTED — the console will show this until it is resolved." >&2
}

accept_pdf(){
  local src="$1" via="$2"
  mv "$src" "$P/$KEY.pdf"
  BYTES=$(stat -c %s "$P/$KEY.pdf"); SHA=$(sha256sum "$P/$KEY.pdf" | cut -c1-16)
  if [[ ! -s "$P/$KEY.txt" ]] && command -v pdftotext >/dev/null 2>&1; then
    pdftotext -q "$P/$KEY.pdf" "$P/$KEY.txt" 2>/dev/null && \
      echo "text: $P/$KEY.txt ($(wc -l < "$P/$KEY.txt") lines)"
  elif [[ -s "$P/$KEY.txt" ]]; then
    echo "text: $P/$KEY.txt ($(wc -l < "$P/$KEY.txt") lines)"
  fi
  record ok "$BYTES" "$SHA" "${NOTE:+$NOTE; }${via}"
  [[ -f "$WANTED" ]] && grep -v "^| $KEY |" "$WANTED" > "$WANTED.t" 2>/dev/null && mv "$WANTED.t" "$WANTED"
  rm -f "$P/.$KEY.err" "$P/$KEY.notpdf" "$P/$KEY.pdf.part"
  echo "cached: $P/$KEY.pdf ($BYTES bytes, sha $SHA) via $via"
  exit 0
}

# try_get <url> <out> — sets HTTP; 0 if body is PDF
try_get(){
  local u="$1" out="$2"
  HTTP=$(curl -sS -L --max-time 120 -A "$UA" \
    -H 'Accept: application/pdf,*/*' \
    -o "$out" -w '%{http_code}' "$u" 2>>"$P/.$KEY.err" || echo 000)
  [[ "$HTTP" == "200" && "$(head -c 4 "$out" 2>/dev/null)" == "%PDF" ]]
}

# ---- already cached? ---------------------------------------------------------
if [[ -s "$P/$KEY.pdf" ]]; then
  echo "already cached: $P/$KEY.pdf ($(du -h "$P/$KEY.pdf" | cut -f1))"
  [[ -s "$P/$KEY.txt" ]] && echo "text: $P/$KEY.txt ($(wc -l < "$P/$KEY.txt") lines)"
  exit 0
fi

PART="$P/$KEY.pdf.part"
rm -f "$PART" "$P/.$KEY.err"

# ---- 1. direct ---------------------------------------------------------------
echo "fetching $URL"
if try_get "$URL" "$PART"; then
  FINAL_URL="$URL"
  accept_pdf "$PART" "direct"
fi
if [[ -s "$PART" && "$(head -c 4 "$PART" 2>/dev/null)" != "%PDF" ]]; then
  KIND=$(head -c 40 "$PART" 2>/dev/null | tr -d '\0' | tr '\n' ' ' | cut -c1-40)
  [[ -z "$KIND" ]] && KIND="empty or unreadable"
  echo "direct: HTTP ${HTTP:-?} not a PDF ($KIND)" >&2
else
  echo "direct: HTTP ${HTTP:-000}" >&2
fi
rm -f "$PART"

# ---- 2. open-access locators (Unpaywall / OpenAlex / Semantic Scholar) -------
if [[ -n "$DOI" ]]; then
  echo "open-access locator for doi:$DOI"
  mapfile -t CANDS < <(DOI="$DOI" OA_MAIL="$OA_MAIL" UA="$UA" python3 <<'PY'
import json, os, urllib.parse, urllib.request

doi = os.environ["DOI"]
mail = os.environ.get("OA_MAIL", "papers@localhost")
ua = os.environ.get("UA", "autotao-fetch/1.0")
enc = urllib.parse.quote(doi, safe="")
out, seen = [], set()

def add(u):
    if not u or u in seen:
        return
    seen.add(u)
    out.append(u)

def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()
    except Exception:
        return b""

# Unpaywall
raw = get(f"https://api.unpaywall.org/v2/{enc}?email={urllib.parse.quote(mail)}")
if raw:
    try:
        d = json.loads(raw)
        locs = []
        if d.get("best_oa_location"):
            locs.append(d["best_oa_location"])
        locs += d.get("oa_locations") or []
        for loc in locs:
            if isinstance(loc, dict):
                add(loc.get("url_for_pdf"))
                add(loc.get("url"))
    except Exception:
        pass

# OpenAlex
raw = get(f"https://api.openalex.org/works/https://doi.org/{enc}")
if raw:
    try:
        d = json.loads(raw)
        oa = d.get("open_access") or {}
        add(oa.get("oa_url"))
        pl = d.get("primary_location") or {}
        add(pl.get("pdf_url"))
        for loc in d.get("locations") or []:
            if isinstance(loc, dict):
                add(loc.get("pdf_url"))
                if loc.get("is_oa"):
                    add(loc.get("landing_page_url"))
    except Exception:
        pass

# Semantic Scholar (openAccessPdf + ArXiv id)
raw = get(
    f"https://api.semanticscholar.org/graph/v1/paper/DOI:{enc}"
    f"?fields=openAccessPdf,externalIds"
)
if raw:
    try:
        d = json.loads(raw)
        p = d.get("openAccessPdf") or {}
        add(p.get("url"))
        ext = d.get("externalIds") or {}
        aid = ext.get("ArXiv") or ext.get("arXiv")
        if aid:
            add(f"https://arxiv.org/pdf/{aid}")
    except Exception:
        pass

for u in out:
    print(u)
PY
)
  n=${#CANDS[@]}
  echo "  ${n} candidate URL(s)"
  for cu in "${CANDS[@]:-}"; do
    [[ -n "$cu" ]] || continue
    [[ "$cu" == "$URL" ]] && continue
    echo "  trying $cu"
    if try_get "$cu" "$PART"; then
      FINAL_URL="$cu"
      accept_pdf "$PART" "oa"
    fi
    # landing page may embed citation_pdf_url
    if [[ -s "$PART" && "$(head -c 4 "$PART" 2>/dev/null)" != "%PDF" ]]; then
      mapfile -t EMBED < <(PART="$PART" python3 <<'PY'
import os, re
html = open(os.environ["PART"], "rb").read().decode("utf-8", "replace")
seen, out = set(), []
for pat in (
    r'citation_pdf_url["\'\s]+content=["\']([^"\']+)',
    r'content=["\']([^"\']+\.pdf[^"\']*)["\']',
    r'href=["\']([^"\']+\.pdf[^"\']*)["\']',
):
    for m in re.finditer(pat, html, re.I):
        u = m.group(1).strip()
        if u.startswith("//"):
            u = "https:" + u
        if u.startswith("http") and u not in seen:
            seen.add(u)
            out.append(u)
for u in out:
    print(u)
PY
)
      for eu in "${EMBED[@]:-}"; do
        [[ -n "$eu" ]] || continue
        echo "  embedded $eu"
        if try_get "$eu" "$PART"; then
          FINAL_URL="$eu"
          accept_pdf "$PART" "oa-embed"
        fi
      done
    fi
    rm -f "$PART"
  done
fi

# ---- 3. institutional access (NOT IMPLEMENTED — wire up your own) ------------
# If you have journal access through a university or employer, this is where to add
# it: a resolver that takes "$DOI" and deposits a PDF at "$PART", then calls
# `accept_pdf "$PART" "<source-label>"`. Everything downstream (hashing, text
# extraction, INDEX.tsv, WANTED.md) already works from there.
#
# Deliberately not shipped, because there is no generic version: EZproxy, OpenAthens,
# Shibboleth and IP-range access all differ per institution, and each is governed by
# a licence agreement between YOU and the publisher. Honour it — that agreement
# typically permits personal research use and forbids redistribution, which is also
# why papers/*.pdf is gitignored here.
#
# With no resolver wired up, a paywalled paper simply lands in papers/WANTED.md for a
# human to fetch by hand. That is the intended failure mode, not a bug.

# ---- give up -----------------------------------------------------------------
rm -f "$PART"
REASON="fetch failed (direct+open-access; last HTTP ${HTTP:-000})"
record FAILED 0 - "$REASON; ${NOTE:-}"
flag_wanted "$REASON"
echo "FAILED: $REASON for ${DOI:-$URL}" >&2
[[ -s "$P/.$KEY.err" ]] && sed 's/^/  curl: /' "$P/.$KEY.err" >&2
exit 1
