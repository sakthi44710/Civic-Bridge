"""
DynamoDB Service - All Database Operations
"""
import logging
from typing import Optional, Dict, List, Any
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
from app.services.aws_clients import aws
from app.config import settings
from app.utils.helpers import now_iso

logger = logging.getLogger(__name__)


class DynamoDBService:
    """Handles all DynamoDB operations for CivicBridge"""
    
    def __init__(self):
        self.dynamodb = aws.dynamodb()
        self.users_table = self.dynamodb.Table(settings.USERS_TABLE)
        self.documents_table = self.dynamodb.Table(settings.DOCUMENTS_TABLE)
        self.applications_table = self.dynamodb.Table(settings.APPLICATIONS_TABLE)
        self.schemes_table = self.dynamodb.Table(settings.SCHEMES_TABLE)
        self.conversations_table = self.dynamodb.Table(settings.CONVERSATIONS_TABLE)
    
    # ==================== USER OPERATIONS ====================
    
    def create_user(self, user_data: Dict) -> Dict:
        user_data["created_at"] = now_iso()
        user_data["updated_at"] = now_iso()
        self.users_table.put_item(Item=user_data)
        return user_data
    
    def get_user(self, user_id: str) -> Optional[Dict]:
        try:
            response = self.users_table.get_item(Key={"user_id": user_id})
            return response.get("Item")
        except ClientError as e:
            logger.error(f"Error getting user {user_id}: {e}")
            return None
    
    def get_user_by_phone(self, phone_number: str) -> Optional[Dict]:
        try:
            response = self.users_table.query(
                IndexName="phone-index",
                KeyConditionExpression=Key("phone_number").eq(phone_number)
            )
            items = response.get("Items", [])
            return items[0] if items else None
        except ClientError as e:
            logger.error(f"Error finding user by phone {phone_number}: {e}")
            return None
    
    def update_user(self, user_id: str, updates: Dict) -> Optional[Dict]:
        updates["updated_at"] = now_iso()
        update_expr_parts = []
        expr_attr_values = {}
        expr_attr_names = {}
        
        for key, value in updates.items():
            safe_key = f"#k_{key}"
            val_key = f":v_{key}"
            update_expr_parts.append(f"{safe_key} = {val_key}")
            expr_attr_values[val_key] = value
            expr_attr_names[safe_key] = key
        
        try:
            response = self.users_table.update_item(
                Key={"user_id": user_id},
                UpdateExpression="SET " + ", ".join(update_expr_parts),
                ExpressionAttributeValues=expr_attr_values,
                ExpressionAttributeNames=expr_attr_names,
                ReturnValues="ALL_NEW"
            )
            return response.get("Attributes")
        except ClientError as e:
            logger.error(f"Error updating user {user_id}: {e}")
            return None
    
    def delete_user(self, user_id: str) -> bool:
        try:
            self.users_table.delete_item(Key={"user_id": user_id})
            return True
        except ClientError as e:
            logger.error(f"Error deleting user {user_id}: {e}")
            return False
    
    def scan_table(self, table_name: str) -> List[Dict]:
        """Scan entire table (use sparingly - for small datasets only)"""
        try:
            table = self.dynamodb.Table(table_name)
            response = table.scan()
            items = response.get("Items", [])
            while "LastEvaluatedKey" in response:
                response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
                items.extend(response.get("Items", []))
            return items
        except ClientError as e:
            logger.error(f"Error scanning table {table_name}: {e}")
            return []
    
    def save_otp(self, phone_number: str, otp: str):
        """Store OTP temporarily with TTL"""
        from datetime import datetime
        import time
        ttl = int(time.time()) + 300  # 5 minutes expiry
        self.users_table.update_item(
            Key={"user_id": f"otp_{phone_number}"},
            UpdateExpression="SET otp_code = :otp, phone_number = :phone, ttl_expire = :ttl",
            ExpressionAttributeValues={
                ":otp": otp,
                ":phone": phone_number,
                ":ttl": ttl
            }
        )
    
    def verify_otp(self, phone_number: str, otp: str) -> bool:
        """Verify OTP for phone number"""
        import time
        try:
            response = self.users_table.get_item(Key={"user_id": f"otp_{phone_number}"})
            item = response.get("Item")
            if not item:
                return False
            if item.get("otp_code") != otp:
                return False
            if int(item.get("ttl_expire", 0)) < int(time.time()):
                return False
            # Delete OTP after verification
            self.users_table.delete_item(Key={"user_id": f"otp_{phone_number}"})
            return True
        except ClientError:
            return False
    
    # ==================== DOCUMENT OPERATIONS ====================
    
    def save_document(self, doc_data: Dict) -> Dict:
        doc_data["upload_date"] = now_iso()
        self.documents_table.put_item(Item=doc_data)
        return doc_data
    
    def get_document(self, user_id: str, document_id: str) -> Optional[Dict]:
        try:
            response = self.documents_table.get_item(
                Key={"user_id": user_id, "document_id": document_id}
            )
            return response.get("Item")
        except ClientError as e:
            logger.error(f"Error getting document {document_id}: {e}")
            return None
    
    def get_user_documents(self, user_id: str) -> List[Dict]:
        try:
            response = self.documents_table.query(
                KeyConditionExpression=Key("user_id").eq(user_id)
            )
            return response.get("Items", [])
        except ClientError as e:
            logger.error(f"Error listing documents for {user_id}: {e}")
            return []
    
    def get_documents_by_type(self, user_id: str, doc_type: str) -> List[Dict]:
        try:
            response = self.documents_table.query(
                KeyConditionExpression=Key("user_id").eq(user_id),
                FilterExpression=Attr("document_type").eq(doc_type)
            )
            return response.get("Items", [])
        except ClientError as e:
            logger.error(f"Error getting documents by type: {e}")
            return []
    
    def update_document(self, user_id: str, document_id: str, updates: Dict) -> Optional[Dict]:
        update_expr_parts = []
        expr_attr_values = {}
        expr_attr_names = {}
        
        for key, value in updates.items():
            safe_key = f"#k_{key}"
            val_key = f":v_{key}"
            update_expr_parts.append(f"{safe_key} = {val_key}")
            expr_attr_values[val_key] = value
            expr_attr_names[safe_key] = key
        
        try:
            response = self.documents_table.update_item(
                Key={"user_id": user_id, "document_id": document_id},
                UpdateExpression="SET " + ", ".join(update_expr_parts),
                ExpressionAttributeValues=expr_attr_values,
                ExpressionAttributeNames=expr_attr_names,
                ReturnValues="ALL_NEW"
            )
            return response.get("Attributes")
        except ClientError as e:
            logger.error(f"Error updating document: {e}")
            return None
    
    def delete_document(self, user_id: str, document_id: str) -> bool:
        try:
            self.documents_table.delete_item(
                Key={"user_id": user_id, "document_id": document_id}
            )
            return True
        except ClientError as e:
            logger.error(f"Error deleting document: {e}")
            return False
    
    # ==================== SCHEME OPERATIONS ====================
    
    def save_scheme(self, scheme_data: Dict) -> Dict:
        self.schemes_table.put_item(Item=scheme_data)
        return scheme_data
    
    def get_scheme(self, scheme_id: str) -> Optional[Dict]:
        try:
            response = self.schemes_table.get_item(Key={"scheme_id": scheme_id})
            return response.get("Item")
        except ClientError as e:
            logger.error(f"Error getting scheme {scheme_id}: {e}")
            return None
    
    def get_all_schemes(self) -> List[Dict]:
        try:
            response = self.schemes_table.scan()
            return response.get("Items", [])
        except ClientError as e:
            logger.error(f"Error listing schemes: {e}")
            return []
    
    def get_schemes_by_category(self, category: str) -> List[Dict]:
        try:
            response = self.schemes_table.query(
                IndexName="category-index",
                KeyConditionExpression=Key("category").eq(category)
            )
            return response.get("Items", [])
        except ClientError as e:
            logger.error(f"Error getting schemes by category: {e}")
            return []
    
    # ==================== APPLICATION OPERATIONS ====================
    
    def save_application(self, app_data: Dict) -> Dict:
        app_data["created_at"] = now_iso()
        app_data["updated_at"] = now_iso()
        self.applications_table.put_item(Item=app_data)
        return app_data
    
    def get_application(self, user_id: str, application_id: str) -> Optional[Dict]:
        try:
            response = self.applications_table.get_item(
                Key={"user_id": user_id, "application_id": application_id}
            )
            return response.get("Item")
        except ClientError as e:
            logger.error(f"Error getting application: {e}")
            return None
    
    def get_user_applications(self, user_id: str) -> List[Dict]:
        try:
            response = self.applications_table.query(
                KeyConditionExpression=Key("user_id").eq(user_id)
            )
            return response.get("Items", [])
        except ClientError as e:
            logger.error(f"Error listing applications: {e}")
            return []
    
    def update_application(self, user_id: str, application_id: str, updates: Dict) -> Optional[Dict]:
        updates["updated_at"] = now_iso()
        update_expr_parts = []
        expr_attr_values = {}
        expr_attr_names = {}
        
        for key, value in updates.items():
            safe_key = f"#k_{key}"
            val_key = f":v_{key}"
            update_expr_parts.append(f"{safe_key} = {val_key}")
            expr_attr_values[val_key] = value
            expr_attr_names[safe_key] = key
        
        try:
            response = self.applications_table.update_item(
                Key={"user_id": user_id, "application_id": application_id},
                UpdateExpression="SET " + ", ".join(update_expr_parts),
                ExpressionAttributeValues=expr_attr_values,
                ExpressionAttributeNames=expr_attr_names,
                ReturnValues="ALL_NEW"
            )
            return response.get("Attributes")
        except ClientError as e:
            logger.error(f"Error updating application: {e}")
            return None
    
    # ==================== CONVERSATION OPERATIONS ====================
    
    def save_conversation(self, conv_data: Dict) -> Dict:
        conv_data["created_at"] = now_iso()
        conv_data["updated_at"] = now_iso()
        self.conversations_table.put_item(Item=conv_data)
        return conv_data
    
    def get_conversation(self, user_id: str, conversation_id: str) -> Optional[Dict]:
        try:
            response = self.conversations_table.get_item(
                Key={"user_id": user_id, "conversation_id": conversation_id}
            )
            return response.get("Item")
        except ClientError as e:
            logger.error(f"Error getting conversation: {e}")
            return None
    
    def update_conversation(self, user_id: str, conversation_id: str, updates: Dict) -> Optional[Dict]:
        updates["updated_at"] = now_iso()
        update_expr_parts = []
        expr_attr_values = {}
        expr_attr_names = {}
        
        for key, value in updates.items():
            safe_key = f"#k_{key}"
            val_key = f":v_{key}"
            update_expr_parts.append(f"{safe_key} = {val_key}")
            expr_attr_values[val_key] = value
            expr_attr_names[safe_key] = key
        
        try:
            response = self.conversations_table.update_item(
                Key={"user_id": user_id, "conversation_id": conversation_id},
                UpdateExpression="SET " + ", ".join(update_expr_parts),
                ExpressionAttributeValues=expr_attr_values,
                ExpressionAttributeNames=expr_attr_names,
                ReturnValues="ALL_NEW"
            )
            return response.get("Attributes")
        except ClientError as e:
            logger.error(f"Error updating conversation: {e}")
            return None
    
    def get_user_conversations(self, user_id: str) -> List[Dict]:
        """Get all conversations for a user"""
        try:
            response = self.conversations_table.query(
                KeyConditionExpression=Key("user_id").eq(user_id),
                ScanIndexForward=False
            )
            return response.get("Items", [])
        except ClientError as e:
            logger.error(f"Error getting user conversations: {e}")
            return []
    
    def delete_conversation(self, user_id: str, conversation_id: str) -> bool:
        """Delete a conversation"""
        try:
            self.conversations_table.delete_item(
                Key={"user_id": user_id, "conversation_id": conversation_id}
            )
            return True
        except ClientError as e:
            logger.error(f"Error deleting conversation: {e}")
            return False


# Singleton instance
db = DynamoDBService()
