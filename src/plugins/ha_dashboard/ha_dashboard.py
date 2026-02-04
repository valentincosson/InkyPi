import logging
import json
import os
from plugins.base_plugin.base_plugin import BasePlugin
from utils.ha_connector import HAConnector
from datetime import datetime
import pytz

logger = logging.getLogger(__name__)

class HADashboard(BasePlugin):
    """Home Assistant Dashboard Plugin."""

    def generate_settings_template(self):
        template_params = super().generate_settings_template()
        template_params['style_settings'] = True
        template_params['api_key'] = {
            "required": True,
            "service": "Home Assistant",
            "expected_key": "HOME_ASSISTANT_TOKEN"
        }
        template_params['show_refresh_time'] = {
            "required": False,
            "default": False
        }
        return template_params

    def generate_image(self, settings, device_config):
        ha_url = settings.get('ha_url')
        cards_json = settings.get('cards_json', '[]')
        
        try:
            cards = json.loads(cards_json)
        except Exception:
            cards = []

        # Load token from environment
        ha_token = device_config.load_env_key("HOME_ASSISTANT_TOKEN")
        if not ha_token:
            raise RuntimeError("Home Assistant Token not configured.")
        if not ha_url:
            raise RuntimeError("Home Assistant URL not configured.")

        ha = HAConnector(ha_url, ha_token)
        
        # Fetch all states once to improve performance
        all_states = ha.get_states() or []
        states_map = {s.get('entity_id'): s for s in all_states}
        
        # Fetch data for each card
        enriched_cards = []
        for card in cards:
            entity_id = card.get('entity_id')
            label = card.get('label')
            unit = card.get('unit', '')
            
            if entity_id:
                state_data = states_map.get(entity_id)
                if state_data:
                    value = state_data.get('state', 'Unknown')
                    # Handle attributes if needed (e.g., unit_of_measurement)
                    if not unit:
                        unit = state_data.get('attributes', {}).get('unit_of_measurement', '')
                    
                    enriched_cards.append({
                        **card,
                        "value": value,
                        "unit": unit,
                        "friendly_name": state_data.get('attributes', {}).get('friendly_name', label)
                    })
                else:
                    enriched_cards.append({**card, "value": "N/A", "error": True})

        # Get timezone for refresh time
        timezone = device_config.get_config("timezone", default="Europe/Paris")
        tz = pytz.timezone(timezone)
        now = datetime.now(tz)
        time_format = device_config.get_config("time_format", default="24h")
        last_refresh_time = now.strftime("%H:%M") if time_format == "24h" else now.strftime("%I:%M %p")

        # Ensure local image paths are file:// URIs for the headless browser
        bg_image = settings.get('backgroundImageFile')
        if bg_image and bg_image.startswith('/') and not bg_image.startswith('file://'):
            settings['backgroundImageFile'] = f"file://{bg_image}"

        template_params = {
            "cards": enriched_cards,
            "last_refresh_time": last_refresh_time,
            "show_refresh_time": settings.get('show_refresh_time', False),
            "plugin_settings": settings,
            # Color customization for e-ink displays
            "card_text_color": settings.get('card_text_color'),
            "card_bg_color": settings.get('card_bg_color'),
            "card_bg_opacity": float(settings.get('card_bg_opacity', 0.5)),
            "card_border_color": settings.get('card_border_color'),
            "use_text_shadow": settings.get('use_text_shadow', False)
        }

        dimensions = device_config.get_resolution()
        if device_config.get_config("orientation") == "vertical":
            dimensions = dimensions[::-1]

        image = self.render_image(dimensions, "dashboard.html", "dashboard.css", template_params)

        if not image:
            raise RuntimeError("Failed to render dashboard, please check logs.")
        
        return image
