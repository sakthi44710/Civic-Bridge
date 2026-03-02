"""
AWS Textract Service - Document OCR
"""
import logging
from typing import Dict, List
from botocore.exceptions import ClientError
from app.services.aws_clients import aws
from app.config import settings

logger = logging.getLogger(__name__)


class TextractService:
    """AWS Textract for document OCR and data extraction"""
    
    def __init__(self):
        self.client = aws.textract()
    
    def extract_text(self, file_bytes: bytes) -> Dict:
        """Extract text from document image/PDF"""
        try:
            response = self.client.detect_document_text(
                Document={"Bytes": file_bytes}
            )
            
            lines = []
            words = []
            confidence_scores = []
            
            for block in response.get("Blocks", []):
                if block["BlockType"] == "LINE":
                    lines.append(block["Text"])
                    confidence_scores.append(block["Confidence"])
                elif block["BlockType"] == "WORD":
                    words.append(block["Text"])
            
            avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
            
            return {
                "full_text": "\n".join(lines),
                "lines": lines,
                "words": words,
                "confidence": round(avg_confidence, 2),
                "block_count": len(response.get("Blocks", []))
            }
        except ClientError as e:
            logger.error(f"Textract detect_document_text error: {e}")
            raise
    
    def extract_forms(self, file_bytes: bytes) -> Dict:
        """Extract key-value pairs from forms"""
        try:
            response = self.client.analyze_document(
                Document={"Bytes": file_bytes},
                FeatureTypes=["FORMS"]
            )
            
            key_value_pairs = {}
            key_map = {}
            value_map = {}
            block_map = {}
            
            for block in response.get("Blocks", []):
                block_id = block["Id"]
                block_map[block_id] = block
                
                if block["BlockType"] == "KEY_VALUE_SET":
                    if "KEY" in block.get("EntityTypes", []):
                        key_map[block_id] = block
                    else:
                        value_map[block_id] = block
            
            for key_id, key_block in key_map.items():
                key_text = self._get_text(key_block, block_map)
                value_text = ""
                
                for relationship in key_block.get("Relationships", []):
                    if relationship["Type"] == "VALUE":
                        for value_id in relationship["Ids"]:
                            if value_id in value_map:
                                value_text = self._get_text(value_map[value_id], block_map)
                
                if key_text:
                    key_value_pairs[key_text.strip()] = value_text.strip()
            
            return {
                "key_value_pairs": key_value_pairs,
                "pair_count": len(key_value_pairs)
            }
        except ClientError as e:
            logger.error(f"Textract analyze_document error: {e}")
            raise
    
    def extract_from_s3(self, s3_key: str, bucket: str = None) -> Dict:
        """Extract text from document stored in S3"""
        bucket = bucket or settings.DOCUMENTS_BUCKET
        try:
            response = self.client.detect_document_text(
                Document={
                    "S3Object": {
                        "Bucket": bucket,
                        "Name": s3_key
                    }
                }
            )
            
            lines = []
            confidence_scores = []
            
            for block in response.get("Blocks", []):
                if block["BlockType"] == "LINE":
                    lines.append(block["Text"])
                    confidence_scores.append(block["Confidence"])
            
            avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
            
            return {
                "full_text": "\n".join(lines),
                "lines": lines,
                "confidence": round(avg_confidence, 2)
            }
        except ClientError as e:
            logger.error(f"Textract S3 extraction error: {e}")
            raise
    
    def _get_text(self, block: Dict, block_map: Dict) -> str:
        """Extract text from a block and its children"""
        text = ""
        if "Relationships" in block:
            for relationship in block["Relationships"]:
                if relationship["Type"] == "CHILD":
                    for child_id in relationship["Ids"]:
                        child_block = block_map.get(child_id, {})
                        if child_block.get("BlockType") == "WORD":
                            text += child_block.get("Text", "") + " "
                        elif child_block.get("BlockType") == "SELECTION_ELEMENT":
                            if child_block.get("SelectionStatus") == "SELECTED":
                                text += "SELECTED "
        return text


# Singleton
textract_service = TextractService()
