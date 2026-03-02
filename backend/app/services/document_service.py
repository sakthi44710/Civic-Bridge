"""
Document Service - Orchestrates Document Processing Pipeline
Upload → S3 → OCR (Textract) → Entity Extraction (Comprehend) → Classification (Bedrock)
"""
import logging
from typing import Dict, Optional
from app.services.s3_service import s3_service
from app.services.textract_service import textract_service
from app.services.comprehend_service import comprehend_service
from app.services.bedrock_service import bedrock_service
from app.services.dynamodb_service import db
from app.utils.helpers import generate_id, file_hash, get_document_category, now_iso

logger = logging.getLogger(__name__)


class DocumentService:
    """Full document processing pipeline"""
    
    def process_document(self, user_id: str, file_content: bytes, filename: str,
                         content_type: str, document_type: str = None) -> Dict:
        """Complete pipeline: Upload → OCR → Extract → Classify → Store"""
        
        document_id = generate_id()
        content_hash = file_hash(file_content)
        
        # Step 1: Check for duplicates
        existing_docs = db.get_user_documents(user_id)
        for doc in existing_docs:
            if doc.get("content_hash") == content_hash:
                return {
                    "status": "duplicate",
                    "message": "This document has already been uploaded",
                    "existing_document_id": doc["document_id"]
                }
        
        # Step 2: Upload to S3
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "pdf"
        s3_key = f"documents/{user_id}/{document_id}.{ext}"
        s3_service.upload_file(file_content, s3_key, content_type)
        
        # Step 3: OCR with Textract
        try:
            ocr_result = textract_service.extract_text(file_content)
            ocr_text = ocr_result.get("full_text", "")
            ocr_confidence = ocr_result.get("confidence", 0)
        except Exception as e:
            logger.error(f"OCR failed: {e}")
            ocr_text = ""
            ocr_confidence = 0
        
        # Step 4: Entity Extraction with Comprehend
        extracted_entities = {}
        if ocr_text:
            try:
                entity_result = comprehend_service.extract_entities(ocr_text)
                extracted_entities = entity_result.get("entities", {})
            except Exception as e:
                logger.error(f"Entity extraction failed: {e}")
        
        # Step 5: Classification with Bedrock
        classified_type = document_type or "other"
        ai_generated_name = filename
        extracted_data = {}
        
        if ocr_text:
            try:
                classification = bedrock_service.classify_document(ocr_text)
                if not document_type:
                    classified_type = classification.get("document_type", "other")
                extracted_data = classification.get("extracted_data", {})
                ai_generated_name = classification.get("ai_generated_name", filename)
            except Exception as e:
                logger.error(f"Classification failed: {e}")
        
        # Step 6: Store metadata in DynamoDB
        doc_data = {
            "user_id": user_id,
            "document_id": document_id,
            "original_filename": filename,
            "ai_generated_name": ai_generated_name,
            "document_type": classified_type,
            "category": get_document_category(classified_type),
            "s3_key": s3_key,
            "content_type": content_type,
            "file_size": len(file_content),
            "content_hash": content_hash,
            "status": "processed",
            "ocr_text": ocr_text[:5000] if ocr_text else "",  # Truncate for DynamoDB
            "ocr_confidence": str(ocr_confidence),
            "extracted_data": extracted_data,
            "extracted_entities": extracted_entities,
            "is_verified": False,
            "upload_date": now_iso(),
            "processed_date": now_iso(),
        }
        
        db.save_document(doc_data)
        
        # Generate presigned URL for viewing
        view_url = s3_service.get_presigned_url(s3_key)
        
        return {
            "status": "processed",
            "document_id": document_id,
            "document_type": classified_type,
            "ai_generated_name": ai_generated_name,
            "extracted_data": extracted_data,
            "ocr_confidence": ocr_confidence,
            "view_url": view_url,
        }
    
    def get_document(self, user_id: str, document_id: str) -> Optional[Dict]:
        """Get document with presigned URL"""
        doc = db.get_document(user_id, document_id)
        if doc and doc.get("s3_key"):
            doc["view_url"] = s3_service.get_presigned_url(doc["s3_key"])
        return doc
    
    def get_user_documents(self, user_id: str) -> list:
        """Get all documents for user with presigned URLs"""
        docs = db.get_user_documents(user_id)
        for doc in docs:
            if doc.get("s3_key"):
                doc["view_url"] = s3_service.get_presigned_url(doc["s3_key"])
        return docs
    
    def delete_document(self, user_id: str, document_id: str) -> bool:
        """Delete document from S3 and DynamoDB"""
        doc = db.get_document(user_id, document_id)
        if not doc:
            return False
        
        # Delete from S3
        if doc.get("s3_key"):
            s3_service.delete_file(doc["s3_key"])
        
        # Delete from DynamoDB
        return db.delete_document(user_id, document_id)
    
    def check_required_documents(self, user_id: str, required_docs: list) -> Dict:
        """Check which required documents user has"""
        user_docs = db.get_user_documents(user_id)
        user_doc_types = {doc["document_type"] for doc in user_docs}
        
        available = []
        missing = []
        
        for req_doc in required_docs:
            doc_type = req_doc if isinstance(req_doc, str) else req_doc.get("document_type", "")
            if doc_type in user_doc_types:
                available.append(doc_type)
            else:
                missing.append(doc_type)
        
        return {
            "available": available,
            "missing": missing,
            "all_available": len(missing) == 0,
            "total_required": len(required_docs),
            "total_available": len(available)
        }


# Singleton
document_service = DocumentService()
