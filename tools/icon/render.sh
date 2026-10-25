#!/bin/sh
# Renders tools/icon/lumen.svg to the app icons (public/icon.png 80 px, public/largeIcon.png 130 px).
# Needs Google Chrome and macOS sips.   Run: sh tools/icon/render.sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../public"
chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
tmp=$(mktemp -d)
printf '<html><body style="margin:0;background:transparent"><img src="file://%s" width="512" height="512"></body></html>' "$here/lumen.svg" > "$tmp/icon.html"
"$chrome" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 --allow-file-access-from-files --window-size=512,512 --screenshot="$tmp/icon.png" "file://$tmp/icon.html" >/dev/null 2>&1
sips -z 130 130 "$tmp/icon.png" --out "$out/largeIcon.png" >/dev/null
sips -z 80 80 "$tmp/icon.png" --out "$out/icon.png" >/dev/null
cp "$tmp/icon.png" "$here/lumen-512.png"
rm -rf "$tmp"
echo "icons written"
