import requests
import logging

logger = logging.getLogger(__name__)

class HAConnector:
    """Helper class to interact with Home Assistant REST API."""
    
    def __init__(self, url, token):
        self.url = url.rstrip('/')
        self.token = token
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def get_states(self):
        """Fetches all states from Home Assistant."""
        endpoint = f"{self.url}/api/states"
        try:
            response = requests.get(endpoint, headers=self.headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch states from HA: {e}")
            return None

    def get_state(self, entity_id):
        """Fetches the state of a specific entity."""
        endpoint = f"{self.url}/api/states/{entity_id}"
        try:
            response = requests.get(endpoint, headers=self.headers, timeout=5)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch state for {entity_id} from HA: {e}")
            return None

    def test_connection(self):
        """Tests the connection to Home Assistant."""
        endpoint = f"{self.url}/api/"
        try:
            response = requests.get(endpoint, headers=self.headers, timeout=5)
            return response.status_code == 200 and response.json().get("message") == "API running."
        except Exception as e:
            logger.error(f"HA connection test failed: {e}")
            return False
