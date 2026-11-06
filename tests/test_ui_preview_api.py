"""L'aperçu génère une image sans laisser de trace : ni écran, ni rotation, ni configuration, ni fichier."""
import hashlib
import io
import os
from datetime import datetime

import pytest
from PIL import Image

import ui.blueprint as ui_blueprint
import utils.app_utils as app_utils
from refresh_task import RefreshTask
from ui.blueprint import ui_bp


def png(size=(800, 480), color="red", kind="PNG"):
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format=kind)
    buffer.seek(0)
    return buffer


def fingerprint(path):
    with open(path, "rb") as file:
        return hashlib.sha256(file.read()).hexdigest()


class FakePlugin:
    """Remplace un plugin : garde ce qu'il a reçu et rend ce que le test demande."""

    def __init__(self, result=None, error=None, during=None):
        self.result = result if result is not None else Image.new("RGB", (800, 480), "white")
        self.error = error
        self.during = during
        self.settings = None

    def generate_image(self, settings, device_config):
        self.settings = settings
        if self.during:
            self.during(settings)
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def client(app):
    app.register_blueprint(ui_bp)
    return app.test_client()


@pytest.fixture
def use_plugin(monkeypatch):
    def install(plugin):
        monkeypatch.setattr(ui_blueprint, "get_plugin_instance", lambda config: plugin)
        return plugin
    return install


@pytest.fixture
def saved_dir(tmp_path, monkeypatch):
    """Le dossier des fichiers enregistrés, sous le répertoire du test."""
    folder = tmp_path / "static" / "images" / "saved"
    folder.mkdir(parents=True)
    monkeypatch.setattr(app_utils, "resolve_path", lambda path: str(tmp_path / path))
    return folder


def send(client, plugin_id="clock", **fields):
    return client.post("/ui/api/preview", data={"plugin_id": plugin_id, **fields}, content_type="multipart/form-data")


class TestLeavesNoTrace:
    def test_the_screen_and_the_engine_are_left_alone(self, client, device_config, device_file, refresh_task, use_plugin):
        use_plugin(FakePlugin())
        before = device_file.read_bytes()
        info = device_config.get_refresh_info().to_dict()

        response = send(client)

        assert response.status_code == 200
        assert refresh_task.actions == []
        assert refresh_task.config_changes == 0
        assert not os.path.exists(device_config.current_image_file)
        assert os.listdir(device_config.plugin_image_dir) == []
        assert device_file.read_bytes() == before
        assert device_config.get_refresh_info().to_dict() == info

    def test_a_real_plugin_keeps_its_rotation_and_its_saved_settings(self, client, device_config, device_file, saved_dir):
        """Image Upload écrit son index dans les réglages reçus : cela ne doit pas atteindre l'entrée enregistrée."""
        first = saved_dir / "first.png"
        Image.new("RGB", (800, 480), "green").save(first)
        settings = {"imageFiles[]": [str(first)], "image_index": 0}
        device_config.get_playlist_manager().add_plugin_to_playlist(
            "Default", {"plugin_id": "image_upload", "name": "Photos", "plugin_settings": settings, "refresh": {"interval": 3600}},
        )
        device_config.write_config()
        before = device_file.read_bytes()

        response = client.post(
            "/ui/api/preview",
            data={"plugin_id": "image_upload", "imageFiles[]": [str(first)]},
            content_type="multipart/form-data",
        )

        assert response.status_code == 200
        assert device_config.get_playlist_manager().find_plugin("image_upload", "Photos").settings == settings
        assert device_file.read_bytes() == before

    def test_a_chosen_file_reaches_the_plugin_then_disappears(self, client, saved_dir, use_plugin):
        seen = {}

        def during(settings):
            path = settings["imageFiles[]"][0]
            seen.update(path=path, existed=os.path.exists(path), content=Image.open(path).getpixel((0, 0)))

        use_plugin(FakePlugin(during=during))
        response = client.post(
            "/ui/api/preview",
            data={"plugin_id": "image_upload", "imageFiles[]": [(png(color="blue"), "new.png")]},
            content_type="multipart/form-data",
        )

        assert response.status_code == 200
        assert seen["existed"] is True
        assert seen["content"] == (0, 0, 255)
        assert not os.path.exists(seen["path"])
        assert list(saved_dir.iterdir()) == []

    def test_a_chosen_file_never_replaces_a_saved_one_of_the_same_name(self, client, saved_dir, use_plugin):
        saved = saved_dir / "holiday.png"
        Image.new("RGB", (10, 10), "green").save(saved)
        before = fingerprint(saved)
        use_plugin(FakePlugin())

        response = client.post(
            "/ui/api/preview",
            data={"plugin_id": "image_upload", "imageFiles[]": [(png(color="blue"), "holiday.png")]},
            content_type="multipart/form-data",
        )

        assert response.status_code == 200
        assert fingerprint(saved) == before

    def test_existing_and_chosen_files_are_both_sent_to_the_plugin(self, client, saved_dir, use_plugin):
        plugin = use_plugin(FakePlugin())
        client.post(
            "/ui/api/preview",
            data={"plugin_id": "image_upload", "imageFiles[]": ["/saved/old.png", (png(), "new.png")]},
            content_type="multipart/form-data",
        )
        files = plugin.settings["imageFiles[]"]
        assert files[0] == "/saved/old.png"
        assert os.path.basename(files[1]) == "new.png"

    def test_a_chosen_file_disappears_when_the_plugin_fails(self, client, saved_dir, use_plugin):
        seen = []
        use_plugin(FakePlugin(error=RuntimeError("no"), during=lambda settings: seen.append(settings["imageFiles[]"][0])))
        response = client.post(
            "/ui/api/preview",
            data={"plugin_id": "image_upload", "imageFiles[]": [(png(), "new.png")]},
            content_type="multipart/form-data",
        )
        assert response.status_code == 500
        assert not os.path.exists(seen[0])
        assert list(saved_dir.iterdir()) == []


class TestImage:
    def test_answers_with_a_png_nobody_caches(self, client, use_plugin):
        use_plugin(FakePlugin())
        response = send(client)
        assert response.mimetype == "image/png"
        assert "no-store" in response.headers["Cache-Control"]
        assert Image.open(io.BytesIO(response.data)).size == (800, 480)

    def test_sends_the_settings_without_the_plugin_id(self, client, use_plugin):
        plugin = use_plugin(FakePlugin())
        send(client, title="Hello")
        assert plugin.settings == {"title": "Hello"}

    def test_crops_what_the_screen_would_crop(self, client, use_plugin):
        """Une image 3:2 perd ses bords sur un écran 5:3 : l'aperçu doit le montrer."""
        tall = Image.new("RGB", (1536, 1024), "black")
        tall.paste("white", (0, 0, 1536, 50))
        use_plugin(FakePlugin(result=tall))
        image = Image.open(io.BytesIO(send(client).data)).convert("RGB")
        assert image.size == (800, 480)
        # La bande blanche du haut sort du cadre : 1024 - 1536 * 3/5 = 102 pixels coupés, 51 de chaque côté.
        assert image.getpixel((400, 0)) == (0, 0, 0)

    def test_keeps_the_top_of_a_plugin_that_asks_for_it(self, client, device_config, use_plugin):
        tall = Image.new("RGB", (800, 1000), "black")
        tall.paste("white", (0, 0, 800, 50))
        use_plugin(FakePlugin(result=tall))
        device_config.get_plugin("clock")["image_settings"] = ["keep-width"]
        image = Image.open(io.BytesIO(send(client).data)).convert("RGB")
        assert image.getpixel((400, 0)) == (255, 255, 255)

    def test_a_portrait_screen_gives_a_portrait_image(self, client, device_config, use_plugin):
        device_config.update_value("orientation", "vertical")
        use_plugin(FakePlugin(result=Image.new("RGB", (480, 800), "white")))
        assert Image.open(io.BytesIO(send(client).data)).size == (480, 800)


class TestEngine:
    def test_waits_for_the_engine_to_finish_rendering(self, client, refresh_task, use_plugin):
        held = []
        use_plugin(FakePlugin(during=lambda settings: held.append(refresh_task.lock.locked())))
        send(client)
        assert held == [True]
        assert not refresh_task.lock.locked()

    def test_gives_the_engine_back_its_lock_after_a_failure(self, client, refresh_task, use_plugin):
        use_plugin(FakePlugin(error=RuntimeError("no")))
        send(client)
        assert not refresh_task.lock.locked()

    def test_uses_the_lock_of_the_real_engine_while_it_runs(self, app, client, device_config, use_plugin):
        """Le faux moteur des autres tests ne verrait pas un verrou renommé ou un interblocage."""
        # Un arrêt demandé avant que le thread s'endorme n'attend ainsi qu'une seconde.
        device_config.update_value("plugin_cycle_interval_seconds", 1)
        engine = RefreshTask(device_config, None)
        app.config["REFRESH_TASK"] = engine
        held = []
        use_plugin(FakePlugin(during=lambda settings: held.append(engine.lock.locked())))
        engine.start()
        try:
            assert send(client).status_code == 200
            assert held == [True]
            assert not engine.lock.locked()
        finally:
            engine.stop()

    def test_works_while_the_engine_is_stopped(self, client, refresh_task, use_plugin):
        refresh_task.running = False
        use_plugin(FakePlugin())
        assert send(client).status_code == 200


class TestFailures:
    def test_unknown_plugin(self, client):
        response = send(client, plugin_id="nope")
        assert response.status_code == 404
        assert response.get_json()["error"] == "Plugin not found"

    def test_missing_plugin_id(self, client):
        response = client.post("/ui/api/preview", data={}, content_type="multipart/form-data")
        assert response.status_code == 404

    def test_plugin_error_is_explained(self, client, use_plugin):
        use_plugin(FakePlugin(error=RuntimeError("OPEN AI API Key not configured.")))
        response = send(client)
        assert response.status_code == 500
        assert response.get_json()["error"] == "OPEN AI API Key not configured."

    def test_an_internal_error_stays_in_the_logs(self, client, use_plugin):
        use_plugin(FakePlugin(error=KeyError("list-title[]")))
        response = send(client)
        assert response.status_code == 500
        assert response.get_json()["error"] == "The plugin couldn't generate this image. Check the device logs."

    def test_plugin_without_an_image_is_explained(self, client, monkeypatch):
        class NoImage:
            def generate_image(self, settings, device_config):
                return None
        monkeypatch.setattr(ui_blueprint, "get_plugin_instance", lambda config: NoImage())
        response = send(client)
        assert response.status_code == 500
        assert response.get_json()["error"] == "The plugin didn't produce an image."


class TestFormData:
    def test_describes_the_screen(self, client):
        device = client.get("/ui/api/plugins/clock").get_json()["device"]
        assert (device["width"], device["height"]) == (800, 480)
        assert device["time_format"] in ("12h", "24h")
        assert device["timezone"]

    def test_portrait_screen(self, client, device_config):
        device_config.update_value("orientation", "vertical")
        device = client.get("/ui/api/plugins/clock").get_json()["device"]
        assert (device["width"], device["height"]) == (480, 800)

    def test_new_item_has_no_saved_image(self, client):
        assert client.get("/ui/api/plugins/clock").get_json()["saved_image"] is None

    def test_item_that_never_ran_has_no_saved_image(self, client, device_config):
        device_config.get_playlist_manager().add_plugin_to_playlist(
            "Default", {"plugin_id": "clock", "name": "Hall", "plugin_settings": {}, "refresh": {"interval": 3600}},
        )
        assert client.get("/ui/api/plugins/clock?instance=Hall").get_json()["saved_image"] is None

    def test_item_that_ran_points_at_its_image(self, client, device_config):
        manager = device_config.get_playlist_manager()
        manager.add_plugin_to_playlist(
            "Default", {"plugin_id": "clock", "name": "Hall way", "plugin_settings": {}, "refresh": {"interval": 3600}},
        )
        moment = datetime(2026, 1, 1, 8, 0).isoformat()
        manager.find_plugin("clock", "Hall way").latest_refresh_time = moment
        saved = client.get("/ui/api/plugins/clock?instance=Hall way").get_json()["saved_image"]
        assert saved["refreshed_at"] == moment
        assert saved["url"].startswith("/plugin_instance_image/Default/clock/Hall%20way?v=")
