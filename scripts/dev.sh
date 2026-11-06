#!/usr/bin/env bash
# Prépare l'environnement puis lance InkyPi en mode développement, sans écran e-ink.
# Tout ce que ce script crée reste ignoré par git (.venv, .dev, bibliothèques JS).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

VENV_DIR=".venv"
DEV_DIR=".dev"
REQUIREMENTS="install/requirements-test.txt"
INSTALLED_MARKER="$DEV_DIR/requirements-installed"
CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

mkdir -p "$DEV_DIR/bin"

if [ ! -x "$VENV_DIR/bin/python" ]; then
    if command -v uv >/dev/null; then
        uv venv --python 3.12 "$VENV_DIR"
    elif command -v python3.12 >/dev/null; then
        python3.12 -m venv "$VENV_DIR"
    else
        echo "Python 3.12 est requis : installez uv ou python3.12." >&2
        exit 1
    fi
fi

if [ ! -f "$INSTALLED_MARKER" ] || [ "$REQUIREMENTS" -nt "$INSTALLED_MARKER" ] || [ install/requirements-dev.txt -nt "$INSTALLED_MARKER" ]; then
    if command -v uv >/dev/null; then
        uv pip install --python "$VENV_DIR/bin/python" -r "$REQUIREMENTS"
    else
        "$VENV_DIR/bin/python" -m pip install -r "$REQUIREMENTS"
    fi
    touch "$INSTALLED_MARKER"
fi

for vendor_file in src/static/styles/select2.min.css src/static/scripts/select2.min.js src/static/scripts/jquery.min.js src/static/scripts/chart.js src/static/scripts/calendar.min.js; do
    if [ ! -s "$vendor_file" ]; then
        bash install/update_vendors.sh
        break
    fi
done

# Le rendu HTML cherche un binaire « chrome » dans le PATH, que Google Chrome ne fournit pas sur macOS.
browser_found=false
for browser in chromium-headless-shell chromium chrome; do
    if command -v "$browser" >/dev/null; then
        browser_found=true
    fi
done
if [ "$browser_found" = false ] && [ -x "$CHROME_APP" ]; then
    printf '#!/usr/bin/env bash\nexec "%s" "$@"\n' "$CHROME_APP" > "$DEV_DIR/bin/chrome"
    chmod +x "$DEV_DIR/bin/chrome"
fi

# Les boutons Reboot et Shutdown lancent une vraie commande sudo : ils ne doivent pas agir sur cette machine.
printf '#!/usr/bin/env bash\necho "[dev] commande ignorée : sudo $*"\n' > "$DEV_DIR/bin/sudo"
chmod +x "$DEV_DIR/bin/sudo"

# Le mode --dev réécrit sa configuration : on travaille sur une copie pour ne pas modifier le fichier suivi par git.
if [ ! -f "$DEV_DIR/device.json" ]; then
    cp src/config/device_dev.json "$DEV_DIR/device.json"
fi

export INKYPI_DEV_CONFIG="$PWD/$DEV_DIR/device.json"
export PATH="$PWD/$DEV_DIR/bin:$PATH"
exec "$VENV_DIR/bin/python" src/inkypi.py --dev
