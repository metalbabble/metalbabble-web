#!/usr/bin/env bash
# update-content.sh
# Refreshes the VIDEOS and BLOG sections of ../index.html with the latest content.
# Run from any directory: ./util/update-content.sh  or  bash util/update-content.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX="$SCRIPT_DIR/../index.html"

YT_CHANNEL="metalbabbleDotCom"
WP_FEED="https://metalbabble.wordpress.com/feed/"

# ── helpers ─────────────────────────────────────────────────────────────────

need() { command -v "$1" &>/dev/null || { echo "ERROR: '$1' not found. Install it and retry."; exit 1; }; }
need curl
need python3

# ── fetch YouTube RSS (no API key required) ──────────────────────────────────

echo "Fetching YouTube feed for @${YT_CHANNEL}..."

# Resolve channel ID from the handle page
CHANNEL_PAGE=$(curl -fsSL "https://www.youtube.com/@${YT_CHANNEL}" 2>/dev/null) || {
  echo "ERROR: Could not fetch YouTube channel page."
  exit 1
}

CHANNEL_ID=$(echo "$CHANNEL_PAGE" | python3 -c "
import sys, re
html = sys.stdin.read()
m = re.search(r'\"channelId\":\"(UC[^\"]+)\"', html)
if not m:
    m = re.search(r'channel_id=(UC[^&\"\']+)', html)
if m:
    print(m.group(1))
" 2>/dev/null)

if [[ -z "$CHANNEL_ID" ]]; then
  echo "ERROR: Could not determine YouTube channel ID for @${YT_CHANNEL}."
  echo "       Try visiting https://www.youtube.com/@${YT_CHANNEL} manually."
  exit 1
fi

echo "  Channel ID: $CHANNEL_ID"

YT_RSS="https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}"
YT_XML=$(curl -fsSL "$YT_RSS") || { echo "ERROR: Could not fetch YouTube RSS."; exit 1; }

# Parse 4 most recent videos: extract id and title
YT_DATA=$(echo "$YT_XML" | python3 -c "
import sys, re, xml.etree.ElementTree as ET

xml = sys.stdin.read()
ns = {
    'atom': 'http://www.w3.org/2005/Atom',
    'yt':   'http://www.youtube.com/xml/schemas/2015',
    'media':'http://search.yahoo.com/mrss/',
}
root = ET.fromstring(xml)
entries = root.findall('atom:entry', ns)[:4]
for e in entries:
    vid_id = e.find('yt:videoId', ns).text
    title  = e.find('atom:title', ns).text.replace('|', '\\\\|')
    print(f'{vid_id}|{title}')
")

if [[ -z "$YT_DATA" ]]; then
  echo "ERROR: Could not parse YouTube feed."
  exit 1
fi

echo "  Found videos:"
while IFS='|' read -r vid_id title; do
  echo "    $vid_id  $title"
done <<< "$YT_DATA"

# ── fetch WordPress RSS ───────────────────────────────────────────────────────

echo "Fetching WordPress feed..."
WP_XML=$(curl -fsSL "$WP_FEED") || { echo "ERROR: Could not fetch WordPress feed."; exit 1; }

WP_DATA=$(echo "$WP_XML" | python3 -c "
import sys, xml.etree.ElementTree as ET, html

xml = sys.stdin.read()
root = ET.fromstring(xml)
channel = root.find('channel')
items = channel.findall('item')[:3]
for item in items:
    title = html.unescape(item.find('title').text.strip()).replace('|', '\\\\|')
    link  = item.find('link').text.strip()
    print(f'{link}|{title}')
")

if [[ -z "$WP_DATA" ]]; then
  echo "ERROR: Could not parse WordPress feed."
  exit 1
fi

echo "  Found posts:"
while IFS='|' read -r link title; do
  echo "    $title"
done <<< "$WP_DATA"

# ── rewrite index.html ───────────────────────────────────────────────────────

echo "Updating $INDEX..."

python3 - "$INDEX" "$YT_DATA" "$WP_DATA" <<'PYEOF'
import sys, re

index_path = sys.argv[1]
yt_raw     = sys.argv[2]   # newline-separated "id|title" lines
wp_raw     = sys.argv[3]   # newline-separated "url|title" lines

with open(index_path, 'r', encoding='utf-8') as f:
    html = f.read()

def replace_inner(html, tag, elem_id, new_content, indent):
    """Replace the innerHTML of the first <tag id="elem_id"> element."""
    open_pat  = re.compile(rf'<{tag}(?:\s[^>]*)?\bid="{elem_id}"[^>]*>', re.IGNORECASE)
    open_scan = re.compile(rf'<{tag}[\s>]', re.IGNORECASE)
    close_pat = re.compile(rf'</{tag}>', re.IGNORECASE)

    m = open_pat.search(html)
    if not m:
        raise ValueError(f'<{tag} id="{elem_id}"> not found')

    pos = m.end()
    depth = 1
    while depth:
        nxt_open  = open_scan.search(html, pos)
        nxt_close = close_pat.search(html, pos)
        if nxt_close is None:
            raise ValueError(f'No matching </{tag}> for id="{elem_id}"')
        if nxt_open and nxt_open.start() < nxt_close.start():
            depth += 1
            pos = nxt_open.end()
        else:
            depth -= 1
            if depth == 0:
                inner_end   = nxt_close.start()
                close_end   = nxt_close.end()
            else:
                pos = nxt_close.end()

    return html[:m.end()] + '\n' + new_content + '\n' + indent + html[inner_end:]

# ── Build replacement video blocks ──────────────────────────────────────────
yt_entries = [line.split('|', 1) for line in yt_raw.strip().splitlines() if line]

video_blocks = []
for vid_id, title in yt_entries:
    block = (
        '      <div class="yt-embed-wrapper">\n'
        f'        <iframe src="https://www.youtube.com/embed/{vid_id}"\n'
        f'          title="{title}"\n'
        '          frameborder="0"\n'
        '          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"\n'
        '          allowfullscreen loading="lazy"></iframe>\n'
        '      </div>'
    )
    video_blocks.append(block)

html = replace_inner(html, 'div', 'yt-list', '\n'.join(video_blocks), '    ')

# ── Build replacement blog list items ────────────────────────────────────────
wp_entries = [line.split('|', 1) for line in wp_raw.strip().splitlines() if line]

li_blocks = []
for url, title in wp_entries:
    li = (
        '      <li>\n'
        f'        <a href="{url}" class="text-link" target="_blank" rel="noopener">{title}</a>\n'
        '      </li>'
    )
    li_blocks.append(li)

html = replace_inner(html, 'ul', 'blog-list', '\n'.join(li_blocks), '    ')

with open(index_path, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"  Wrote {len(yt_entries)} video(s) and {len(wp_entries)} blog post(s).")
PYEOF

echo "Done. index.html has been updated."
