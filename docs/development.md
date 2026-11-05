# InkyPi Development Quick Start

## Development Without Hardware

The `--dev` flag enables complete development without requiring:

- Raspberry Pi hardware
- Physical e-ink displays (Inky pHAT/wHAT or Waveshare)
- Root privileges or GPIO access
- Linux-specific features (systemd)

Works on **macOS**, **Linux**, and **Windows** - no hardware needed!

## Setup
<table>
<tr>
<td>
Traditional setup method

```bash
# 1. Clone and setup
git clone https://github.com/fatihak/InkyPi.git
cd InkyPi

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Install Python dependencies and run
pip install -r install/requirements-dev.txt
bash install/update_vendors.sh
python src/inkypi.py --dev
```

</td>
<td>
Alternative method using devbox - works on macOS / any Linux distro / WSL2

```bash
setopt INTERACTIVE_COMMENTS # enable interactive comments in zsh

# 1. Install devbox and direnv (direnv is optional but recommended)
command -v devbox >/dev/null || curl -fsSL https://get.jetify.com/devbox | bash
command -v direnv >/dev/null || nix profile install "nixpkgs#direnv" \
  && eval "$(direnv hook ${SHELL##*/})" >> ~/.${SHELL##*/}rc \
  && source ~/.${SHELL##*/}rc # If not already present: install direnv, add hooks to shell rc and activate

# 2. Clone and setup
git clone https://github.com/fatihak/InkyPi.git
cd InkyPi # direnv reads .envrc -> runs devbox shell -> installs deps & activates venv

# 3. Run InkyPi in developer mode via devbox
devbox run dev # alternatively run `devbox shell` and then run `python src/inkypi.py --dev`
```

</td>
</tr>
</table>

**That's it!** Open http://localhost:8080 and start developing.

## What You Can Do

- **Develop plugins** - Create new plugins without hardware (no Raspberry Pi, nor physical displays)
- **Test UI changes** - Instant feedback on web interface modifications  
- **Debug issues** - Full error messages in terminal
- **Verify rendering** - Check output in `mock_display_output/latest.png`
- **Cross-platform development** - Works on macOS, Linux, Windows

## Essential Commands

<table>
<tr>
<td>

Traditional activation method

```bash
source venv/bin/activate             # Activate virtual environment
python src/inkypi.py --dev           # Start development server
deactivate                           # Exit virtual environment
```

</td>
<td>
devbox / direnv method

```bash
devbox run dev # run InkyPi in dev mode, terminating deactivates `devbox shell`

# direnv will activate / deactivate `devbox shell` automatically when entering
# and leaving the project directory (provided `direnv allow` has run once)... 
# Otherwise to manually activate / deactivate:
devbox shell                         # Installs deps, and activates Python virtual environment
python src/inkypi.py --dev           # Start development server
exit                                 # Exit devbox shell and deactivates Python virtual environment
```

</td>
</tr>
</table>

## Development Tips

1. **Check rendered output**: Images are saved to `mock_display_output/`
2. **Plugin development**: Copy an existing plugin as template (e.g., `clock/`)
3. **Configuration**: Edit `src/config/device_dev.json` for display settings
4. **Hot reload**: Restart server to see code changes

## Testing Your Changes

1. Configure a plugin through the web UI
2. Click "Display" button
3. Check `mock_display_output/latest.png` for result
4. Iterate quickly without deployment

## Other Requirements

InkyPi relies on system packages for some features, which are normally installed via the `install.sh` script. **(Skip if using devbox method)**

### Linux
**(Skip this section if using devbox method)**

The required packages can be found in this file: 

https://github.com/fatihak/InkyPi/blob/main/install/debian-requirements.txt

Use your favourite package manager (such as `apt`) to install them.

### Chromium or Google Chrome browser

InkyPi uses `--headless` mode to rendering HTML templates to PNG images using a Chrome-like browser.  

Different platforms have different available browser packages, refer to the recommended packages in the table below: 

| Platform | Recommended Package | Notes |
| --- | --- | --- |
| Raspbian / Debian | chromium-headless-shell | chromium or google-chrome will also work if in PATH  |
| All other Linux | chromium | devbox method installs chromium on Linux, as `chromium-headless-shell` is usually not packaged |
| macOS | Google Chrome | chromium on macOS / aarch64 is not considered stable,<br>For devbox method, Google Chrome must be installed at its default location: <br>`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`|
| Windows | Chromium or Google Chrome | devbox method installs chromium on WSL2,<br>if using native Windows (not devbox via WSL2), chromium or google-chrome should also work if in PATH | 

InkyPi will search for a Chrome-like browser in the project's PATH (if using devbox method) and your system's PATH in that order. 


## Quick start script

`scripts/dev.sh` prepares everything and starts the server on http://localhost:8080. It requires `uv` or Python 3.12, works without devbox, and is the simplest option on macOS:

- creates `.venv` and installs the dependencies, then downloads the vendor JS files if needed;
- makes Google Chrome available to the HTML renderer;
- keeps its configuration in `.dev/device.json`, so `src/config/device_dev.json` stays untouched;
- neutralises the `sudo` commands behind the Reboot and Shutdown buttons.

To start over with a clean configuration, delete `.dev/device.json`.

**Warning:** with any other setup, including `python src/inkypi.py --dev`, the Reboot and Shutdown buttons run the real `sudo reboot` and `sudo shutdown -h now` on your machine.

## Running the tests

```bash
.venv/bin/python -m pytest
```

`tests/test_plugin_forms.py` drives every plugin form in Google Chrome, and is skipped if Playwright or Chrome is missing. If a form changes on purpose, refresh its reference with `UPDATE_PLUGIN_FORM_SNAPSHOTS=1`.

## New interface

The new interface lives in `src/ui/frontend/` and is served on http://localhost:8080/ui/ from the compiled files in `src/ui/static/bundle/`. Those files are committed, so the Raspberry Pi never needs Node.

```bash
cd src/ui/frontend
npm ci
npm run dev    # hot reload on http://localhost:5173/ui/, with scripts/dev.sh running for the data
npm test
npm run build  # required before committing: a test fails if the bundle no longer matches the sources
```

Do not name a folder `lib`, `dist` or `build` in there: the root `.gitignore` would silently ignore it.

### Plugin forms

Each plugin form is described in `src/ui/frontend/src/forms/definitions.ts` and rendered by a shared engine. A plugin without a description keeps its old page. After changing what a plugin's `settings.html` or `generate_settings_template` offers, update its description; `npm test` compares every description with `settings.html` and with the references in `tests/snapshots/`. To refresh those references:

```bash
UPDATE_PLUGIN_FORM_SNAPSHOTS=1 pytest tests/test_plugin_forms.py tests/test_ui.py
```
