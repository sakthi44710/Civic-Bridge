"""
Notification Service - SMS (SNS), WhatsApp (Twilio), Push Notifications
"""
import json
import logging
from typing import Dict, List, Optional
from botocore.exceptions import ClientError
from app.services.aws_clients import aws
from app.services.translate_service import translate_service
from app.config import settings

logger = logging.getLogger(__name__)

# Notification templates
TEMPLATES = {
    "otp": {
        "en": "Your CivicBridge OTP is: {otp}. Valid for 5 minutes.",
        "hi": "आपका CivicBridge OTP है: {otp}। 5 मिनट के लिए मान्य।",
    },
    "application_submitted": {
        "en": "✅ Application submitted!\n\nScheme: {scheme_name}\nRef: {ref_number}\n\nWe'll notify you of updates.",
        "hi": "✅ आवेदन जमा!\n\nयोजना: {scheme_name}\nसंदर्भ: {ref_number}\n\nहम आपको अपडेट देंगे।",
    },
    "status_update": {
        "en": "📋 Status Update\n\nScheme: {scheme_name}\nStatus: {status}\n\n{details}",
        "hi": "📋 स्थिति अपडेट\n\nयोजना: {scheme_name}\nस्थिति: {status}\n\n{details}",
    },
    "application_approved": {
        "en": "🎉 Congratulations!\n\nYour {scheme_name} application is approved!\nBenefit: ₹{amount}\n\n{next_steps}",
        "hi": "🎉 बधाई!\n\nआपका {scheme_name} आवेदन स्वीकृत!\nलाभ: ₹{amount}\n\n{next_steps}",
    },
    "action_required": {
        "en": "⚠️ Action Required\n\n{scheme_name}\nRequired: {action}\nDeadline: {deadline}",
        "hi": "⚠️ कार्रवाई आवश्यक\n\n{scheme_name}\nआवश्यक: {action}\nसमय सीमा: {deadline}",
    },
    "document_expiry": {
        "en": "📄 Document Expiry Alert\n\nYour {document_type} will expire on {expiry_date}.\nPlease renew it soon.",
        "hi": "📄 दस्तावेज़ समाप्ति अलर्ट\n\nआपका {document_type} {expiry_date} को समाप्त हो रहा है।",
    },
}


class NotificationService:
    """Multi-channel notification service"""
    
    def __init__(self):
        self.sns = aws.sns()
    
    def send_sms(self, phone_number: str, message: str) -> Dict:
        """Send SMS via AWS SNS"""
        try:
            response = self.sns.publish(
                PhoneNumber=f"+91{phone_number}",
                Message=message[:160],  # SMS limit
                MessageAttributes={
                    "AWS.SNS.SMS.SenderID": {
                        "DataType": "String",
                        "StringValue": "CivicBrdg"
                    },
                    "AWS.SNS.SMS.SMSType": {
                        "DataType": "String",
                        "StringValue": "Transactional"
                    }
                }
            )
            logger.info(f"SMS sent to {phone_number}: {response['MessageId']}")
            return {"success": True, "message_id": response["MessageId"]}
        except ClientError as e:
            logger.error(f"SMS send error: {e}")
            return {"success": False, "error": str(e)}
    
    def send_whatsapp(self, phone_number: str, message: str) -> Dict:
        """Send WhatsApp message via Twilio"""
        if not settings.TWILIO_ACCOUNT_SID:
            logger.warning("Twilio not configured, skipping WhatsApp")
            return {"success": False, "error": "Twilio not configured"}
        
        try:
            import httpx
            
            url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
            
            response = httpx.post(
                url,
                auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
                data={
                    "From": f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
                    "To": f"whatsapp:+91{phone_number}",
                    "Body": message
                }
            )
            
            if response.status_code == 201:
                result = response.json()
                logger.info(f"WhatsApp sent to {phone_number}")
                return {"success": True, "message_sid": result.get("sid")}
            else:
                logger.error(f"WhatsApp error: {response.text}")
                return {"success": False, "error": response.text}
                
        except Exception as e:
            logger.error(f"WhatsApp send error: {e}")
            return {"success": False, "error": str(e)}
    
    def send_notification(self, user: Dict, template_key: str,
                          template_data: Dict, channels: List[str] = None) -> Dict:
        """Send notification using template across channels"""
        channels = channels or ["sms"]
        language = user.get("preferred_language", "en")
        phone = user.get("phone_number", "")
        
        # Get template
        template = TEMPLATES.get(template_key, {})
        message = template.get(language) or template.get("en", "")
        
        if not message:
            return {"success": False, "error": "Template not found"}
        
        # Fill template
        try:
            message = message.format(**template_data)
        except KeyError as e:
            logger.warning(f"Missing template variable: {e}")
        
        # If language not in templates, translate
        if language not in template and language != "en":
            translated = translate_service.translate(message, "en", language)
            message = translated.get("translated_text", message)
        
        results = {}
        
        if "sms" in channels and phone:
            results["sms"] = self.send_sms(phone, message)
        
        if "whatsapp" in channels and phone:
            results["whatsapp"] = self.send_whatsapp(phone, message)
        
        return {
            "success": any(r.get("success") for r in results.values()),
            "channels": results
        }


# Singleton
notification_service = NotificationService()
