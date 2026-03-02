"""
Tracking Service - Application Status Monitoring
Uses EventBridge to schedule periodic status checks
"""
import logging
from typing import Dict, List, Optional
from app.services.dynamodb_service import db
from app.services.notification_service import notification_service
from app.utils.helpers import now_iso

logger = logging.getLogger(__name__)


class TrackingService:
    """Application status tracking and monitoring"""
    
    def get_application_status(self, user_id: str, application_id: str) -> Optional[Dict]:
        """Get current application status with timeline"""
        app = db.get_application(user_id, application_id)
        if not app:
            return None
        
        return {
            "application_id": app["application_id"],
            "scheme_name": app.get("scheme_name", ""),
            "status": app.get("status", "draft"),
            "portal_application_id": app.get("portal_application_id"),
            "created_at": app.get("created_at"),
            "submitted_at": app.get("submitted_at"),
            "updated_at": app.get("updated_at"),
            "status_history": app.get("status_history", []),
            "approved_amount": app.get("approved_amount"),
            "acknowledgment_url": app.get("acknowledgment_url"),
        }
    
    def update_status(self, user_id: str, application_id: str,
                      new_status: str, details: str = None,
                      source: str = "system") -> Optional[Dict]:
        """Update application status and notify user"""
        app = db.get_application(user_id, application_id)
        if not app:
            return None
        
        old_status = app.get("status")
        if old_status == new_status:
            return app  # No change
        
        # Add to status history
        history = app.get("status_history", [])
        if isinstance(history, str):
            import json
            try:
                history = json.loads(history)
            except (json.JSONDecodeError, TypeError):
                history = []
        
        history.append({
            "status": new_status,
            "previous_status": old_status,
            "timestamp": now_iso(),
            "details": details or "",
            "source": source
        })
        
        updates = {
            "status": new_status,
            "status_history": history,
        }
        
        if new_status == "submitted":
            updates["submitted_at"] = now_iso()
        
        updated = db.update_application(user_id, application_id, updates)
        
        # Send notification
        user = db.get_user(user_id)
        if user:
            template_key = "status_update"
            if new_status == "approved":
                template_key = "application_approved"
            elif new_status == "action_required":
                template_key = "action_required"
            
            try:
                notification_service.send_notification(
                    user=user,
                    template_key=template_key,
                    template_data={
                        "scheme_name": app.get("scheme_name", ""),
                        "status": new_status,
                        "details": details or "",
                        "amount": str(app.get("approved_amount", "")),
                        "next_steps": details or "Check the app for details.",
                        "action": details or "",
                        "deadline": "",
                    },
                    channels=["sms"]
                )
            except Exception as e:
                logger.error(f"Notification failed: {e}")
        
        return updated
    
    def get_user_applications(self, user_id: str) -> List[Dict]:
        """Get all applications for a user"""
        apps = db.get_user_applications(user_id)
        return [
            {
                "application_id": app["application_id"],
                "scheme_id": app.get("scheme_id", ""),
                "scheme_name": app.get("scheme_name", ""),
                "status": app.get("status", "draft"),
                "created_at": app.get("created_at"),
                "submitted_at": app.get("submitted_at"),
                "portal_application_id": app.get("portal_application_id"),
            }
            for app in apps
        ]
    
    def check_portal_status(self, application_id: str) -> Dict:
        """Check status on government portal (called by EventBridge)"""
        # This would use Puppeteer to check portal status
        # For now, return current status
        # In production, this scrapes the government portal
        logger.info(f"Checking portal status for {application_id}")
        return {"checked": True, "status": "pending"}


# Singleton
tracking_service = TrackingService()
