"""Nouvelle interface web : sert le bundle compilé et les données dont elle a besoin.

Le bundle est versionné dans static/bundle : le Pi n'exécute jamais Node.
"""
import io
import logging
import mimetypes
import os
import tempfile
from datetime import datetime, timedelta
from urllib.parse import quote

import pytz
from flask import Blueprint, abort, current_app, jsonify, request, send_file, send_from_directory

from blueprints import apikeys
from plugins.plugin_registry import get_plugin_instance
from refresh_task import PlaylistRefresh
from utils.app_utils import handle_request_files, parse_form
from utils.image_utils import resize_image

logger = logging.getLogger(__name__)

BUNDLE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "bundle")
ONE_YEAR = 31_536_000
UP_NEXT_COUNT = 4

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


def _now(device_config):
    try:
        return datetime.now(pytz.timezone(device_config.get_config("timezone", default="UTC")))
    except pytz.UnknownTimeZoneError:
        return datetime.now(pytz.UTC)


def _active_at(playlist_manager, moment):
    """La playlist que le moteur choisirait à ce moment, avec le même calcul que lui."""
    try:
        return playlist_manager.determine_active_playlist(moment)
    except ValueError as error:
        # L'ancienne page laisse commencer une playlist à 24:00, ce que le calcul de priorité refuse : le moteur
        # n'affiche alors rien. Les pages restent ouvertes pour pouvoir corriger cet horaire.
        logger.warning("A playlist has a time the engine can't use: %s", error)
        return None


def _active_playlist(device_config):
    return _active_at(device_config.get_playlist_manager(), _now(device_config))


def _watching_since(playlist, now):
    """Depuis quand le moteur devrait faire tourner cette playlist : avant, un écran immobile est normal."""
    if playlist.current_plugin_index is None:
        return now
    # Active toute la journée, elle ne s'interrompt jamais : minuit n'est pas un nouveau départ.
    if playlist.start_time == "00:00" and playlist.end_time == "24:00":
        return None
    hours, minutes = playlist.start_time.split(":")
    start = now.replace(hour=int(hours), minute=int(minutes), second=0, microsecond=0)
    return start if start <= now else start - timedelta(days=1)


def _can_refresh(device_config):
    """L'entrée affichée peut être régénérée si elle existe encore et que son plugin est installé."""
    info = device_config.get_refresh_info()
    playlist = device_config.get_playlist_manager().get_playlist(info.playlist) if info.playlist else None
    instance = playlist.find_plugin(info.plugin_id, info.plugin_instance) if playlist else None
    return bool(instance and device_config.get_plugin(info.plugin_id))


def _instance_image_url(playlist, instance):
    return "/plugin_instance_image/" + "/".join(quote(part, safe="") for part in (playlist.name, instance.plugin_id, instance.name))


def _rotation(device_config):
    """Décrit la suite de la rotation sans la faire avancer."""
    playlist = _active_playlist(device_config)
    plugins = playlist.plugins if playlist else []
    index = playlist.current_plugin_index if playlist else None
    start = 0 if index is None else index + 1
    upcoming = [plugins[(start + offset) % len(plugins)] for offset in range(min(len(plugins), UP_NEXT_COUNT))]
    since = _watching_since(playlist, _now(device_config)) if upcoming else None
    return {
        "playlist": playlist.name if playlist else None,
        "interval_seconds": device_config.get_config("plugin_cycle_interval_seconds", default=3600),
        "running": bool(current_app.config["REFRESH_TASK"].running),
        "can_refresh": _can_refresh(device_config),
        "watching_since": since.isoformat() if since else None,
        "upcoming": [
            {
                "plugin_id": instance.plugin_id,
                "instance": instance.name,
                "image_url": _instance_image_url(playlist, instance),
            }
            for instance in upcoming
        ],
    }


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
        "rotation": _rotation(device_config),
    })


@ui_bp.route("/api/show-next", methods=["POST"])
def show_next():
    """Passe à l'entrée suivante et fait avancer la rotation, pour ne pas la remontrer au cycle d'après."""
    device_config = current_app.config["DEVICE_CONFIG"]
    refresh_task = current_app.config["REFRESH_TASK"]
    if not refresh_task.running:
        return jsonify({"error": "Automatic updates are not running."}), 409
    playlist = _active_playlist(device_config)
    if not playlist or not playlist.plugins:
        return jsonify({"error": "No playlist has anything to show right now."}), 409

    previous_index = playlist.current_plugin_index
    instance = playlist.get_next_plugin()
    if not device_config.get_plugin(instance.plugin_id):
        playlist.current_plugin_index = previous_index
        return jsonify({"error": f"The plugin of {instance.name} is no longer installed."}), 409
    try:
        refresh_task.manual_update(PlaylistRefresh(playlist, instance, force=True))
    except Exception as error:
        playlist.current_plugin_index = previous_index
        logger.exception("Could not show the next plugin")
        return jsonify({"error": str(error)}), 500
    return jsonify({"success": True})


def _day_plan(playlist_manager):
    """Ce que le moteur affiche à chaque moment de la journée. Rien ne change entre le début et la fin de deux playlists."""
    edges = {"00:00"}
    for playlist in playlist_manager.playlists:
        edges.update((playlist.start_time, playlist.end_time))
    edges.discard("24:00")
    ordered = sorted(edges)

    plan = []
    for start, end in zip(ordered, [*ordered[1:], "24:00"]):
        active = _active_at(playlist_manager, datetime.strptime(start, "%H:%M"))
        name = active.name if active else None
        if plan and plan[-1]["playlist"] == name:
            plan[-1]["end"] = end
        else:
            plan.append({"start": start, "end": end, "playlist": name})
    return plan


def _describe_entry(device_config, playlist, instance):
    plugin = device_config.get_plugin(instance.plugin_id)
    version = instance.latest_refresh_time
    return {
        "plugin_id": instance.plugin_id,
        "plugin_name": plugin["display_name"] if plugin else instance.plugin_id,
        "instance": instance.name,
        "installed": bool(plugin),
        "refresh": instance.refresh,
        "refreshed_at": version,
        # Une entrée qui n'a jamais tourné n'a pas d'image : inutile de la demander au Pi.
        "image_url": f"{_instance_image_url(playlist, instance)}?v={quote(version, safe='')}" if version else None,
    }


@ui_bp.route("/api/playlists")
def playlists():
    """Décrit les playlists et leur journée. Les changements passent par les routes existantes, sauf l'ordre."""
    device_config = current_app.config["DEVICE_CONFIG"]
    manager = device_config.get_playlist_manager()
    info = device_config.get_refresh_info()
    return jsonify({
        "device": {
            "timezone": device_config.get_config("timezone", default="UTC"),
            "time_format": device_config.get_config("time_format", default="12h"),
        },
        "running": bool(current_app.config["REFRESH_TASK"].running),
        # Un nom d'entrée est unique pour un plugin : le repère survit au renommage d'une playlist.
        "on_screen": {"plugin_id": info.plugin_id, "instance": info.plugin_instance} if info.plugin_instance else None,
        "day": _day_plan(manager),
        "playlists": [
            {
                "name": playlist.name,
                "start_time": playlist.start_time,
                "end_time": playlist.end_time,
                "entries": [_describe_entry(device_config, playlist, instance) for instance in playlist.plugins],
            }
            for playlist in manager.playlists
        ],
    })


@ui_bp.route("/api/playlist-order", methods=["POST"])
def playlist_order():
    """Change l'ordre des entrées d'une playlist, sans déplacer la rotation de l'entrée où elle se trouve."""
    device_config = current_app.config["DEVICE_CONFIG"]
    data = request.get_json(silent=True)
    entries = data.get("entries") if isinstance(data, dict) else None
    if not isinstance(entries, list) or not all(isinstance(entry, dict) for entry in entries):
        return jsonify({"error": "The new order is missing."}), 400
    playlist = device_config.get_playlist_manager().get_playlist(data.get("playlist"))
    if not playlist:
        return jsonify({"error": "This playlist no longer exists."}), 404

    wanted = [(entry.get("plugin_id"), entry.get("instance")) for entry in entries]
    existing = [(instance.plugin_id, instance.name) for instance in playlist.plugins]
    if len(set(existing)) != len(existing) or len(wanted) != len(existing) or not all(key in wanted for key in existing):
        return jsonify({"error": "This playlist has changed. Reload the page and try again."}), 409

    previous_plugins, previous_index = playlist.plugins, playlist.current_plugin_index
    current = previous_plugins[previous_index] if previous_index is not None and previous_index < len(previous_plugins) else None
    playlist.plugins = [previous_plugins[existing.index(key)] for key in wanted]
    if current:
        playlist.current_plugin_index = playlist.plugins.index(current)
    try:
        device_config.write_config()
    except Exception as error:
        playlist.plugins, playlist.current_plugin_index = previous_plugins, previous_index
        logger.exception("Could not save the playlist order")
        return jsonify({"error": str(error)}), 500
    return jsonify({"success": True})


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


def _screen_size(device_config):
    """La taille de l'image telle qu'on la regarde : le pilote la tourne ensuite pour un écran en portrait."""
    width, height = device_config.get_resolution()
    return (height, width) if device_config.get_config("orientation") == "vertical" else (width, height)


def _saved_image(device_config, instance):
    """La dernière image générée pour une entrée, si elle a déjà tourné."""
    if not instance or not instance.latest_refresh_time:
        return None
    playlist = next(playlist for playlist in device_config.get_playlist_manager().playlists if instance in playlist.plugins)
    return {
        "url": f"{_instance_image_url(playlist, instance)}?v={quote(instance.latest_refresh_time, safe='')}",
        "refreshed_at": instance.latest_refresh_time,
    }


@ui_bp.route("/api/preview", methods=["POST"])
def preview():
    """Génère une image sans toucher à l'écran, à la rotation, à la configuration ni aux fichiers enregistrés."""
    device_config = current_app.config["DEVICE_CONFIG"]
    settings = parse_form(request.form)
    plugin_config = device_config.get_plugin(settings.pop("plugin_id", None))
    if not plugin_config:
        return jsonify({"error": "Plugin not found"}), 404

    output = io.BytesIO()
    try:
        # Le verrou du moteur évite deux rendus simultanés, de trop pour la mémoire d'un Pi Zero.
        with tempfile.TemporaryDirectory() as uploads, current_app.config["REFRESH_TASK"].lock:
            settings.update(handle_request_files(request.files, request.form, save_dir=uploads))
            image = get_plugin_instance(plugin_config).generate_image(settings, device_config)
            if image is None:
                return jsonify({"error": "The plugin didn't produce an image."}), 500
            # Même recadrage que le pilote : l'aperçu ne montre pas ce que l'écran coupera.
            resize_image(image, _screen_size(device_config), plugin_config.get("image_settings", [])).save(output, format="PNG")
    except RuntimeError as error:
        # Les plugins lèvent cette erreur avec un message écrit pour l'utilisateur.
        logger.exception("Could not generate the preview")
        return jsonify({"error": str(error)}), 500
    except Exception:
        logger.exception("Could not generate the preview")
        return jsonify({"error": "The plugin couldn't generate this image. Check the device logs."}), 500

    output.seek(0)
    response = send_file(output, mimetype="image/png")
    response.headers["Cache-Control"] = "no-store"
    return response


@ui_bp.route("/api/plugins")
def plugins():
    """Liste les plugins installés, dans l'ordre choisi par l'utilisateur."""
    device_config = current_app.config["DEVICE_CONFIG"]
    return jsonify({"plugins": [{"id": plugin["id"], "name": plugin["display_name"]} for plugin in device_config.get_plugins()]})


@ui_bp.route("/api/plugins/<plugin_id>")
def plugin_form(plugin_id):
    """Donne ce qu'un formulaire de plugin affiche. L'enregistrement passe par les routes existantes."""
    device_config = current_app.config["DEVICE_CONFIG"]
    plugin_config = device_config.get_plugin(plugin_id)
    if not plugin_config:
        return jsonify({"error": "Plugin not found"}), 404

    playlist_manager = device_config.get_playlist_manager()
    instance_name = request.args.get("instance")
    instance = None
    if instance_name:
        instance = playlist_manager.find_plugin(plugin_id, instance_name)
        if not instance:
            return jsonify({"error": f"Plugin instance {instance_name} does not exist"}), 404

    params = get_plugin_instance(plugin_config).generate_settings_template()
    params.pop("settings_template", None)
    env_entries = apikeys.parse_env_file(apikeys.get_env_path())
    width, height = _screen_size(device_config)
    return jsonify({
        "id": plugin_id,
        "name": plugin_config["display_name"],
        "params": params,
        "instance": instance_name if instance else None,
        "settings": instance.settings if instance else None,
        "refresh": instance.refresh if instance else None,
        "device": {
            "timezone": device_config.get_config("timezone", default="UTC"),
            "time_format": device_config.get_config("time_format", default="12h"),
            "width": width,
            "height": height,
        },
        "saved_image": _saved_image(device_config, instance),
        "playlists": playlist_manager.get_playlist_names(),
        "keys_set": [key for key, value in env_entries if value],
    })


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
