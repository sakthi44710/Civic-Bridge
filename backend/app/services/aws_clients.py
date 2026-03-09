"""
Centralized AWS Boto3 Clients
Singleton pattern to reuse connections across Lambda invocations
"""
import boto3
from functools import lru_cache
from app.config import settings


class AWSClients:
    """Centralized AWS client manager"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._region = settings.AWS_REGION
        # Use credentials from settings if available, otherwise use default chain
        if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
            self._session = boto3.Session(
                region_name=self._region,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY
            )
        else:
            self._session = boto3.Session(region_name=self._region)
    
    @lru_cache()
    def dynamodb(self):
        return self._session.resource("dynamodb")
    
    @lru_cache()
    def dynamodb_client(self):
        return self._session.client("dynamodb")
    
    @lru_cache()
    def s3(self):
        return self._session.client("s3")
    
    @lru_cache()
    def bedrock_runtime(self):
        bedrock_region = settings.BEDROCK_API_REGION or self._region
        # Use static API key as bearer token if provided (no Marketplace subscription needed)
        if settings.BEDROCK_API_KEY:
            import os
            os.environ["AWS_BEARER_TOKEN_BEDROCK"] = settings.BEDROCK_API_KEY
        return self._session.client("bedrock-runtime", region_name=bedrock_region)
    
    @lru_cache()
    def textract(self):
        return self._session.client("textract")
    
    @lru_cache()
    def comprehend(self):
        return self._session.client("comprehend")
    
    @lru_cache()
    def translate_client(self):
        return self._session.client("translate")
    
    @lru_cache()
    def sns(self):
        return self._session.client("sns")
    
    @lru_cache()
    def eventbridge(self):
        return self._session.client("events")


@lru_cache()
def get_aws_clients() -> AWSClients:
    return AWSClients()


aws = get_aws_clients()
