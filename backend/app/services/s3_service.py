"""
S3 Service - File Storage Operations
"""
import logging
import base64
from typing import Optional
from botocore.exceptions import ClientError
from app.services.aws_clients import aws
from app.config import settings

logger = logging.getLogger(__name__)


class S3Service:
    """Handles all S3 operations"""
    
    def __init__(self):
        self.s3 = aws.s3()
        self.documents_bucket = settings.DOCUMENTS_BUCKET
        self.screenshots_bucket = settings.SCREENSHOTS_BUCKET
    
    def upload_file(self, file_content: bytes, s3_key: str, 
                    content_type: str = "application/octet-stream",
                    bucket: Optional[str] = None) -> str:
        """Upload file to S3 and return the key"""
        bucket = bucket or self.documents_bucket
        try:
            self.s3.put_object(
                Bucket=bucket,
                Key=s3_key,
                Body=file_content,
                ContentType=content_type,
                ServerSideEncryption="AES256"
            )
            logger.info(f"Uploaded file to s3://{bucket}/{s3_key}")
            return s3_key
        except ClientError as e:
            logger.error(f"Error uploading to S3: {e}")
            raise
    
    def download_file(self, s3_key: str, bucket: Optional[str] = None) -> bytes:
        """Download file from S3"""
        bucket = bucket or self.documents_bucket
        try:
            response = self.s3.get_object(Bucket=bucket, Key=s3_key)
            return response["Body"].read()
        except ClientError as e:
            logger.error(f"Error downloading from S3: {e}")
            raise
    
    def get_presigned_url(self, s3_key: str, bucket: Optional[str] = None,
                          expiration: int = 3600) -> str:
        """Generate presigned URL for download"""
        bucket = bucket or self.documents_bucket
        try:
            url = self.s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": s3_key},
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Error generating presigned URL: {e}")
            raise
    
    def get_upload_presigned_url(self, s3_key: str, content_type: str,
                                 bucket: Optional[str] = None,
                                 expiration: int = 3600) -> str:
        """Generate presigned URL for upload"""
        bucket = bucket or self.documents_bucket
        try:
            url = self.s3.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": bucket,
                    "Key": s3_key,
                    "ContentType": content_type,
                    "ServerSideEncryption": "AES256"
                },
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Error generating upload presigned URL: {e}")
            raise
    
    def delete_file(self, s3_key: str, bucket: Optional[str] = None) -> bool:
        """Delete file from S3"""
        bucket = bucket or self.documents_bucket
        try:
            self.s3.delete_object(Bucket=bucket, Key=s3_key)
            logger.info(f"Deleted s3://{bucket}/{s3_key}")
            return True
        except ClientError as e:
            logger.error(f"Error deleting from S3: {e}")
            return False
    
    def upload_screenshot(self, screenshot_bytes: bytes, session_id: str, 
                          page_num: int) -> str:
        """Upload automation screenshot"""
        s3_key = f"screenshots/{session_id}/page_{page_num}.png"
        self.upload_file(
            screenshot_bytes, s3_key,
            content_type="image/png",
            bucket=self.screenshots_bucket
        )
        return self.get_presigned_url(s3_key, bucket=self.screenshots_bucket)
    
    def file_exists(self, s3_key: str, bucket: Optional[str] = None) -> bool:
        """Check if file exists in S3"""
        bucket = bucket or self.documents_bucket
        try:
            self.s3.head_object(Bucket=bucket, Key=s3_key)
            return True
        except ClientError:
            return False


# Singleton
s3_service = S3Service()
