"""
CivicBridge AWS Setup Script
Creates all DynamoDB tables, S3 buckets, and seeds scheme data.
"""
import boto3
import json
import os
import sys
import time
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REGION = "ap-south-1"
ACCOUNT_ID = None

USERS_TABLE = "civicbridge-users"
DOCUMENTS_TABLE = "civicbridge-documents"
APPLICATIONS_TABLE = "civicbridge-applications"
SCHEMES_TABLE = "civicbridge-schemes"
CONVERSATIONS_TABLE = "civicbridge-conversations"

DOCUMENTS_BUCKET = "civicbridge-documents"
SCREENSHOTS_BUCKET = "civicbridge-screenshots"


def get_account_id():
    global ACCOUNT_ID
    sts = boto3.client("sts", region_name=REGION)
    ACCOUNT_ID = sts.get_caller_identity()["Account"]
    print(f"AWS Account: {ACCOUNT_ID}")
    return ACCOUNT_ID


def create_dynamodb_tables():
    print("\n" + "=" * 60)
    print("CREATING DYNAMODB TABLES (PAY_PER_REQUEST)")
    print("=" * 60)
    
    dynamodb = boto3.client("dynamodb", region_name=REGION)
    existing = dynamodb.list_tables()["TableNames"]
    
    tables = [
        {
            "TableName": USERS_TABLE,
            "KeySchema": [{"AttributeName": "user_id", "KeyType": "HASH"}],
            "AttributeDefinitions": [
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "phone_number", "AttributeType": "S"},
            ],
            "GlobalSecondaryIndexes": [
                {
                    "IndexName": "phone-index",
                    "KeySchema": [{"AttributeName": "phone_number", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
            "BillingMode": "PAY_PER_REQUEST",
        },
        {
            "TableName": DOCUMENTS_TABLE,
            "KeySchema": [
                {"AttributeName": "user_id", "KeyType": "HASH"},
                {"AttributeName": "document_id", "KeyType": "RANGE"},
            ],
            "AttributeDefinitions": [
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "document_id", "AttributeType": "S"},
            ],
            "BillingMode": "PAY_PER_REQUEST",
        },
        {
            "TableName": APPLICATIONS_TABLE,
            "KeySchema": [
                {"AttributeName": "user_id", "KeyType": "HASH"},
                {"AttributeName": "application_id", "KeyType": "RANGE"},
            ],
            "AttributeDefinitions": [
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "application_id", "AttributeType": "S"},
            ],
            "BillingMode": "PAY_PER_REQUEST",
        },
        {
            "TableName": SCHEMES_TABLE,
            "KeySchema": [{"AttributeName": "scheme_id", "KeyType": "HASH"}],
            "AttributeDefinitions": [
                {"AttributeName": "scheme_id", "AttributeType": "S"},
                {"AttributeName": "category", "AttributeType": "S"},
            ],
            "GlobalSecondaryIndexes": [
                {
                    "IndexName": "category-index",
                    "KeySchema": [{"AttributeName": "category", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
            "BillingMode": "PAY_PER_REQUEST",
        },
        {
            "TableName": CONVERSATIONS_TABLE,
            "KeySchema": [
                {"AttributeName": "user_id", "KeyType": "HASH"},
                {"AttributeName": "conversation_id", "KeyType": "RANGE"},
            ],
            "AttributeDefinitions": [
                {"AttributeName": "user_id", "AttributeType": "S"},
                {"AttributeName": "conversation_id", "AttributeType": "S"},
            ],
            "BillingMode": "PAY_PER_REQUEST",
        },
    ]
    
    created = 0
    for table_def in tables:
        name = table_def["TableName"]
        if name in existing:
            print(f"  [SKIP] {name} already exists")
            continue
        try:
            dynamodb.create_table(**table_def)
            print(f"  [CREATE] {name}")
            created += 1
        except Exception as e:
            print(f"  [ERROR] {name}: {e}")
    
    if created > 0:
        print(f"\n  Waiting for {created} tables to become ACTIVE...")
        for table_def in tables:
            name = table_def["TableName"]
            try:
                waiter = dynamodb.get_waiter("table_exists")
                waiter.wait(TableName=name, WaiterConfig={"Delay": 3, "MaxAttempts": 30})
                print(f"  [ACTIVE] {name}")
            except Exception:
                pass
    
    final_tables = dynamodb.list_tables()["TableNames"]
    expected = [USERS_TABLE, DOCUMENTS_TABLE, APPLICATIONS_TABLE, SCHEMES_TABLE, CONVERSATIONS_TABLE]
    ok_count = len([t for t in expected if t in final_tables])
    print(f"\nDynamoDB: {ok_count}/5 tables ready")


def create_s3_buckets():
    print("\n" + "=" * 60)
    print("CREATING S3 BUCKETS")
    print("=" * 60)
    
    s3 = boto3.client("s3", region_name=REGION)
    doc_bucket = f"{DOCUMENTS_BUCKET}-{ACCOUNT_ID}"
    ss_bucket = f"{SCREENSHOTS_BUCKET}-{ACCOUNT_ID}"
    
    existing = [b["Name"] for b in s3.list_buckets()["Buckets"]]
    
    for bucket_name in [doc_bucket, ss_bucket]:
        if bucket_name in existing:
            print(f"  [SKIP] {bucket_name} already exists")
            continue
        try:
            s3.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={"LocationConstraint": REGION}
            )
            s3.put_bucket_encryption(
                Bucket=bucket_name,
                ServerSideEncryptionConfiguration={
                    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
                }
            )
            s3.put_public_access_block(
                Bucket=bucket_name,
                PublicAccessBlockConfiguration={
                    "BlockPublicAcls": True, "IgnorePublicAcls": True,
                    "BlockPublicPolicy": True, "RestrictPublicBuckets": True,
                }
            )
            print(f"  [CREATE] {bucket_name} (encrypted, private)")
        except Exception as e:
            print(f"  [ERROR] {bucket_name}: {e}")
    
    return doc_bucket, ss_bucket


def convert_floats(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats(i) for i in obj]
    return obj


def seed_schemes():
    print("\n" + "=" * 60)
    print("SEEDING SCHEME DATA TO DYNAMODB")
    print("=" * 60)
    
    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    table = dynamodb.Table(SCHEMES_TABLE)
    
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    
    total = 0
    for filename in ["schemes_education.json", "schemes_healthcare.json",
                     "schemes_agriculture.json", "schemes_welfare.json"]:
        filepath = os.path.join(data_dir, filename)
        if not os.path.exists(filepath):
            print(f"  [SKIP] {filename} not found")
            continue
        with open(filepath, "r", encoding="utf-8") as f:
            schemes = json.load(f)
        count = 0
        with table.batch_writer() as batch:
            for scheme in schemes:
                scheme = convert_floats(scheme)
                batch.put_item(Item=scheme)
                count += 1
        print(f"  [SEED] {filename}: {count} schemes")
        total += count
    
    print(f"\nTotal schemes seeded: {total}")


def test_aws_services():
    print("\n" + "=" * 60)
    print("TESTING AWS SERVICE CONNECTIVITY")
    print("=" * 60)
    
    session = boto3.Session(region_name=REGION)
    results = {}
    
    # DynamoDB
    try:
        ddb = session.client("dynamodb")
        tables = ddb.list_tables()["TableNames"]
        results["DynamoDB"] = f"OK ({len(tables)} tables)"
    except Exception as e:
        results["DynamoDB"] = f"FAIL: {e}"
    
    # S3
    try:
        s3 = session.client("s3")
        buckets = s3.list_buckets()["Buckets"]
        results["S3"] = f"OK ({len(buckets)} buckets)"
    except Exception as e:
        results["S3"] = f"FAIL: {e}"
    
    # Bedrock
    try:
        bedrock = session.client("bedrock-runtime")
        response = bedrock.invoke_model(
            modelId="anthropic.claude-3-haiku-20240307-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 10,
                "messages": [{"role": "user", "content": [{"type": "text", "text": "Hi"}]}],
            })
        )
        result = json.loads(response["body"].read())
        results["Bedrock (Claude)"] = f"OK - '{result['content'][0]['text'][:40]}'"
    except Exception as e:
        err = str(e)
        if "AccessDeniedException" in err:
            results["Bedrock (Claude)"] = "NEED_ACCESS: Enable model in Bedrock console"
        else:
            results["Bedrock (Claude)"] = f"FAIL: {err[:120]}"
    
    # Transcribe
    try:
        transcribe = session.client("transcribe")
        transcribe.list_transcription_jobs(MaxResults=1)
        results["Transcribe (STT)"] = "OK"
    except Exception as e:
        results["Transcribe (STT)"] = f"FAIL: {e}"
    
    # Polly
    try:
        polly = session.client("polly")
        voices = polly.describe_voices(LanguageCode="en-IN")
        names = [v["Id"] for v in voices.get("Voices", [])]
        results["Polly (TTS)"] = f"OK - Voices: {', '.join(names[:3])}"
    except Exception as e:
        results["Polly (TTS)"] = f"FAIL: {e}"
    
    # Textract
    try:
        textract = session.client("textract")
        results["Textract (OCR)"] = "OK (client ready)"
    except Exception as e:
        results["Textract (OCR)"] = f"FAIL: {e}"
    
    # Comprehend
    try:
        comprehend = session.client("comprehend")
        resp = comprehend.detect_dominant_language(Text="Hello, this is a test")
        lang = resp["Languages"][0]["LanguageCode"]
        results["Comprehend (NLP)"] = f"OK - Detected: {lang}"
    except Exception as e:
        results["Comprehend (NLP)"] = f"FAIL: {e}"
    
    # Translate
    try:
        translate = session.client("translate")
        resp = translate.translate_text(
            Text="Hello", SourceLanguageCode="en", TargetLanguageCode="hi"
        )
        results["Translate"] = f"OK - 'Hello' -> '{resp['TranslatedText']}'"
    except Exception as e:
        results["Translate"] = f"FAIL: {e}"
    
    # SNS
    try:
        sns = session.client("sns")
        results["SNS (SMS)"] = "OK (client ready)"
    except Exception as e:
        results["SNS (SMS)"] = f"FAIL: {e}"
    
    print()
    all_ok = True
    for service, status in results.items():
        icon = "OK" if status.startswith("OK") else "!!"
        print(f"  [{icon}] {service}: {status}")
        if not status.startswith("OK"):
            all_ok = False
    
    print(f"\n{'All services connected!' if all_ok else 'Some services need attention (see above)'}")
    return results


def update_env_file(doc_bucket, ss_bucket):
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if not os.path.exists(env_file):
        return
    with open(env_file, "r") as f:
        lines = f.readlines()
    
    new_lines = []
    for line in lines:
        if line.startswith("DOCUMENTS_BUCKET="):
            new_lines.append(f"DOCUMENTS_BUCKET={doc_bucket}\n")
        elif line.startswith("SCREENSHOTS_BUCKET="):
            new_lines.append(f"SCREENSHOTS_BUCKET={ss_bucket}\n")
        else:
            new_lines.append(line)
    
    with open(env_file, "w") as f:
        f.writelines(new_lines)
    print(f"\n  .env updated: DOCUMENTS_BUCKET={doc_bucket}, SCREENSHOTS_BUCKET={ss_bucket}")


if __name__ == "__main__":
    print("=" * 60)
    print("  CivicBridge AWS Setup - Region: ap-south-1 (Mumbai)")
    print("=" * 60)
    get_account_id()
    create_dynamodb_tables()
    doc_bucket, ss_bucket = create_s3_buckets()
    update_env_file(doc_bucket, ss_bucket)
    seed_schemes()
    test_aws_services()
    print("\n" + "=" * 60)
    print("  SETUP COMPLETE! Restart backend to use AWS services.")
    print("=" * 60)
