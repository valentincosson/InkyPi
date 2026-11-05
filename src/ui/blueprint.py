"""Nouvelle interface web : sert le bundle compilé et les données dont elle a besoin.

Le bundle est versionné dans static/bundle : le Pi n'exécute jamais Node.
"""
import mimetypes
import os
from urllib.parse import quote

import pytz
from flask import Blueprint, abort, current_app, jsonify, request, send_from_directory

from blueprints import apikeys

BUNDLE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "bundle")
ONE_YEAR = 31_536_000

ui_bp = Blueprint("ui", __name__, url_prefix="/ui")


def _safe_is_file(filename):
    path = os.path.abspath(os.path.join(BUNDLE_DIR, filename))
    return path.startswith(BUNDLE_DIR + os.sep) and os.path.isfile(path)


@ui_bp.route("/static/<path:filename>")
def asset(filename):
    """Sert un fichier du bundle, compressé d'avance pour épargner le Pi."""
    # Seuls les noms de fichiers d'assets/ changent à chaque contenu.
    max_age = ONE_YEAR if filename.startswith("assets/") else 0
    compressed = f"{filename}.gz"
    has_compressed = _safe_is_file(compressed)
    if has_compressed and request.accept_encodings.quality("gzip") > 0:
        mimetype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        response = send_from_directory(BUNDLE_DIR, compressed, mimetype=mimetype, max_age=max_age)
        response.headers["Content-Encoding"] = "gzip"
    else:
        response = send_from_directory(BUNDLE_DIR, filename, max_age=max_age)
    if has_compressed:
        response.headers.add("Vary", "Accept-Encoding")
    return response


@ui_bp.route("/api/state")
def state():
    """Décrit l'appareil et ce qui est affiché sur l'écran."""
    device_config = current_app.config["DEVICE_CONFIG"]
    info = device_config.get_refresh_info()
    plugin = device_config.get_plugin(info.plugin_id) if info.plugin_id else None
    version = quote(info.refresh_time or "", safe="")
    return jsonify({
        "device": {
            "name": device_config.get_config("name", default="InkyPi"),
            "timezone": device_config.get_config("timezone", default="UTC"),
            "time_format": device_config.get_config("time_format", default="12h"),
        },
        "screen": {
            "refreshed_at": info.refresh_time,
            "plugin_id": info.plugin_id,
            "plugin_name": plugin.get("display_name", info.plugin_id) if plugin else info.plugin_id,
            "instance": info.plugin_instance,
            "playlist": info.playlist,
            "image_url": f"/api/current_image?v={version}",
        },
    })


@ui_bp.route("/api/settings")
def settings():
    """Décrit les réglages de l'appareil. L'enregistrement passe par /save_settings."""
    device_config = current_app.config["DEVICE_CONFIG"]
    image = device_config.get_config("image_settings", default={})
    return jsonify({
        "name": device_config.get_config("name", default="InkyPi"),
        "orientation": device_config.get_config("orientation", default="horizontal"),
        "rotated": bool(device_config.get_config("inverted_image", default=False)),
        "log_system_stats": bool(device_config.get_config("log_system_stats", default=False)),
        "timezone": device_config.get_config("timezone", default=None),
        "time_format": device_config.get_config("time_format", default="12h"),
        "interval_seconds": device_config.get_config("plugin_cycle_interval_seconds", default=3600),
        "image": {
            "saturation": image.get("saturation", 1.0),
            "contrast": image.get("contrast", 1.0),
            "sharpness": image.get("sharpness", 1.0),
            "brightness": image.get("brightness", 1.0),
            "inky_saturation": image.get("inky_saturation"),
        },
        "inky_display": device_config.get_config("display_type", default="inky") == "inky",
        "timezones": sorted(pytz.all_timezones_set),
    })


@ui_bp.route("/api/api-keys")
def api_keys():
    """Liste les clés enregistrées, jamais leurs valeurs. L'enregistrement passe par /api-keys/save."""
    entries = apikeys.parse_env_file(apikeys.get_env_path())
    return jsonify({"keys": [{"key": key, "has_value": bool(value)} for key, value in entries]})


@ui_bp.route("/api/<path:_unknown>")
def unknown_api(_unknown):
    return jsonify({"error": "Not found"}), 404


@ui_bp.route("/", defaults={"_path": ""})
@ui_bp.route("/<path:_path>")
def shell(_path):
    """Sert l'application : c'est elle qui choisit la page d'après l'adresse."""
    if not _safe_is_file("index.html"):
        abort(503, "The interface bundle is missing.")
    return send_from_directory(BUNDLE_DIR, "index.html", max_age=0)
