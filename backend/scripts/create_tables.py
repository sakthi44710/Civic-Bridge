"""
Create DynamoDB Tables Script
"""
import boto3
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings


def create_tables():
    """Create all required DynamoDB tables"""
    dynamodb = boto3.client("dynamodb", region_name=settings.AWS_REGION)
    
    tables = [
        {
            "TableName": settings.USERS_TABLE,
            "KeySchema": [
                {"AttributeName": "user_id", "KeyType": "HASH"}
            ],
            "AttributeDefinitions": [
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "phone_number", "AttributeType": "S"}
            ],
            "GlobalSecondaryIndexes": [
                {
                    "IndexName": "phone-index",
                    "KeySchema": [
                        {"AttributeName": "phone_number", "KeyType": "HASH"}
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                    "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                }
            ],
            "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
        },
        {
            "TableName": settings.DOCUMENTS_TABLE,
            "KeySchema": [
                {"AttributeName": "user_id", "KeyType": "HASH"},
                {"AttributeName": "document_id", "KeyType": "RANGE"}
            ],
            "AttributeDefinitions": [
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "document_id", "AttributeType": "S"}
            ],
            "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
        },
        {
            "TableName": settings.APPLICATIONS_TABLE,
            "KeySchema": [
                {"AttributeName": "user_id", "KeyType": "HASH"},
                {"AttributeName": "application_id", "KeyType": "RANGE"}
            ],
            "AttributeDefinitions": [
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "application_id", "AttributeType": "S"}
            ],
            "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
        },
        {
            "TableName": settings.SCHEMES_TABLE,
            "KeySchema": [
                {"AttributeName": "scheme_id", "KeyType": "HASH"}
            ],
            "AttributeDefinitions": [
                {"AttributeName": "scheme_id", "AttributeType": "S"},
                {"AttributeName": "category", "AttributeType": "S"}
            ],
            "GlobalSecondaryIndexes": [
                {
                    "IndexName": "category-index",
                    "KeySchema": [
                        {"AttributeName": "category", "KeyType": "HASH"}
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                    "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
                }
            ],
            "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
        },
        {
            "TableName": settings.CONVERSATIONS_TABLE,
            "KeySchema": [
                {"AttributeName": "user_id", "KeyType": "HASH"},
                {"AttributeName": "conversation_id", "KeyType": "RANGE"}
            ],
            "AttributeDefinitions": [
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "conversation_id", "AttributeType": "S"}
            ],
            "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
        },
    ]
    
    existing = dynamodb.list_tables()["TableNames"]
    
    for table_def in tables:
        name = table_def["TableName"]
        if name in existing:
            print(f"Table {name} already exists, skipping")
            continue
        
        try:
            dynamodb.create_table(**table_def)
            print(f"Created table: {name}")
            
            # Wait for table to be active
            waiter = dynamodb.get_waiter("table_exists")
            waiter.wait(TableName=name)
            print(f"  Table {name} is now ACTIVE")
        except Exception as e:
            print(f"Error creating {name}: {e}")
    
    print("\nAll tables ready!")


if __name__ == "__main__":
    create_tables()
