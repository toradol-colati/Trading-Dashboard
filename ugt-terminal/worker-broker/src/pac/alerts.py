import structlog
import os
import aiohttp

logger = structlog.get_logger()

class PACAlerts:
    def __init__(self):
        self.pushover_user = os.getenv("PUSHOVER_USER")
        self.pushover_token = os.getenv("PUSHOVER_TOKEN")

    async def send_notification(self, title: str, message: str):
        logger.info("pac_notification", title=title, message=message)
        
        if self.pushover_user and self.pushover_token:
            async with aiohttp.ClientSession() as session:
                url = "https://api.pushover.net/1/messages.json"
                payload = {
                    "token": self.pushover_token,
                    "user": self.pushover_user,
                    "title": title,
                    "message": message,
                    "priority": 1
                }
                async with session.post(url, data=payload) as resp:
                    if resp.status != 200:
                        logger.error("pushover_alert_failed", status=resp.status)
                    else:
                        logger.info("pushover_alert_sent")
        else:
            # Fallback to simple logging if no credentials
            logger.info("notification_logged_no_credentials", title=title)
