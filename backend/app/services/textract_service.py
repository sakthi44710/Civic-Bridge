"""
AWS Textract Service - Document OCR

Supports: JPEG, PNG, TIFF (sync), PDF (sync single-page, async multi-page),
BMP / WebP / other formats auto-converted to PNG via Pillow.
"""
import io
import logging
import time
from typing import Dict, List
from botocore.exceptions import ClientError
from app.services.aws_clients import aws
from app.config import settings

logger = logging.getLogger(__name__)

# ---------------- format helpers ----------------

def _ensure_textract_compatible(file_bytes: bytes) -> bytes:
    """Convert BMP/WebP/other image formats to PNG so Textract can read them.
    Returns the original bytes if already JPEG/PNG/TIFF/PDF."""
    # Quick header checks for natively-supported formats
    if file_bytes[:4] == b'%PDF':
        return file_bytes
    if file_bytes[:2] == b'\xff\xd8':          # JPEG
        return file_bytes
    if file_bytes[:8] == b'\x89PNG\r\n\x1a\n': # PNG
        return file_bytes
    if file_bytes[:4] in (b'II\x2a\x00', b'MM\x00\x2a'):  # TIFF
        return file_bytes

    # Anything else — convert to PNG via Pillow
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(file_bytes))
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        logger.info("Converted image (%s) to PNG for Textract", img.format or "unknown")
        return buf.getvalue()
    except Exception as e:
        logger.warning("Image conversion failed (%s), sending original bytes to Textract", e)
        return file_bytes


class TextractService:
    """AWS Textract for document OCR and data extraction"""
    
    def __init__(self):
        self.client = aws.textract()
        self.s3 = aws.s3()
    
    def extract_text(self, file_bytes: bytes, filename: str = "") -> Dict:
        """Extract text from document image/PDF.
        Auto-converts unsupported image formats to PNG.
        Falls back to async S3-based API for multi-page PDFs."""
        file_bytes = _ensure_textract_compatible(file_bytes)
        is_pdf = file_bytes[:4] == b'%PDF'

        try:
            return self._sync_detect(file_bytes)
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if is_pdf and code in ("UnsupportedDocumentException", "InvalidParameterException"):
                logger.info("Sync Textract failed for PDF — trying async S3-based extraction")
                return self._async_detect_pdf(file_bytes)
            logger.error(f"Textract detect_document_text error: {e}")
            raise
        except Exception as e:
            logger.error(f"Textract extract_text error: {e}")
            raise

    # ---------- sync single-page ----------

    def _sync_detect(self, file_bytes: bytes) -> Dict:
        """Synchronous single-page detection (JPEG/PNG/TIFF/single-page PDF)."""
        response = self.client.detect_document_text(
            Document={"Bytes": file_bytes}
        )
        return self._parse_blocks(response.get("Blocks", []))

    # ---------- async multi-page PDF ----------

    def _async_detect_pdf(self, pdf_bytes: bytes) -> Dict:
        """Async multi-page PDF detection via S3."""
        key = f"textract-tmp/{int(time.time() * 1000)}.pdf"
        bucket = settings.DOCUMENTS_BUCKET
        try:
            self.s3.put_object(Bucket=bucket, Key=key, Body=pdf_bytes,
                               ContentType="application/pdf")
            resp = self.client.start_document_text_detection(
                DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}
            )
            job_id = resp["JobId"]

            for _ in range(120):
                status = self.client.get_document_text_detection(JobId=job_id)
                job_status = status["JobStatus"]
                if job_status == "SUCCEEDED":
                    blocks = status.get("Blocks", [])
                    next_token = status.get("NextToken")
                    while next_token:
                        more = self.client.get_document_text_detection(
                            JobId=job_id, NextToken=next_token)
                        blocks.extend(more.get("Blocks", []))
                        next_token = more.get("NextToken")
                    return self._parse_blocks(blocks)
                elif job_status == "FAILED":
                    logger.error("Async Textract job failed: %s",
                                 status.get("StatusMessage", "unknown"))
                    return {"full_text": "", "lines": [], "words": [],
                            "confidence": 0, "block_count": 0}
                time.sleep(1)

            logger.error("Async Textract job timed out (120 s)")
            return {"full_text": "", "lines": [], "words": [],
                    "confidence": 0, "block_count": 0}
        finally:
            try:
                self.s3.delete_object(Bucket=bucket, Key=key)
            except Exception:
                pass

    # ---------- helpers ----------

    @staticmethod
    def _parse_blocks(blocks: list) -> Dict:
        """Parse Textract blocks into structured result."""
        lines, words, confidence_scores = [], [], []
        for block in blocks:
            bt = block.get("BlockType")
            if bt == "LINE":
                lines.append(block["Text"])
                confidence_scores.append(block["Confidence"])
            elif bt == "WORD":
                words.append(block["Text"])
        avg_conf = (sum(confidence_scores) / len(confidence_scores)
                    if confidence_scores else 0)
        return {
            "full_text": "\n".join(lines),
            "lines": lines,
            "words": words,
            "confidence": round(avg_conf, 2),
            "block_count": len(blocks),
        }
    
    def extract_forms(self, file_bytes: bytes) -> Dict:
        """Extract key-value pairs from forms"""
        file_bytes = _ensure_textract_compatible(file_bytes)
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
