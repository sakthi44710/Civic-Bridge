import boto3
s = boto3.Session(region_name='ap-south-1')

# Test Translate
print('Testing Translate...')
try:
    t = s.client('translate')
    r = t.translate_text(Text='Hello', SourceLanguageCode='en', TargetLanguageCode='hi')
    print('  Translate: OK -', r["TranslatedText"])
except Exception as e:
    print('  Translate:', str(e)[:120])

# Test Comprehend 
print('Testing Comprehend...')
try:
    c = s.client('comprehend')
    r = c.detect_dominant_language(Text='Hello world')
    print('  Comprehend: OK -', r["Languages"][0]["LanguageCode"])
except Exception as e:
    print('  Comprehend:', str(e)[:120])

# Test Transcribe
print('Testing Transcribe...')
try:
    tr = s.client('transcribe')
    r = tr.list_transcription_jobs(MaxResults=1)
    print('  Transcribe: OK')
except Exception as e:
    print('  Transcribe:', str(e)[:120])

# Test Polly
print('Testing Polly...')
try:
    p = s.client('polly')
    r = p.synthesize_speech(Text='Hello', OutputFormat='mp3', VoiceId='Kajal', Engine='neural')
    audio = r['AudioStream'].read()
    print('  Polly: OK - got', len(audio), 'bytes of audio')
except Exception as e:
    print('  Polly:', str(e)[:120])

# Test Bedrock Sonnet
print('Testing Bedrock (Claude 3 Sonnet)...')
try:
    import json
    b = s.client('bedrock-runtime')
    r = b.invoke_model(
        modelId='anthropic.claude-3-sonnet-20240229-v1:0',
        contentType='application/json',
        accept='application/json',
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 30,
            "messages": [{"role": "user", "content": [{"type": "text", "text": "Say hello in Hindi"}]}],
        })
    )
    result = json.loads(r['body'].read())
    print('  Bedrock: OK -', result['content'][0]['text'][:50])
except Exception as e:
    print('  Bedrock:', str(e)[:120])

# Test DynamoDB - read schemes
print('Testing DynamoDB (read schemes)...')
try:
    ddb = s.resource('dynamodb')
    table = ddb.Table('civicbridge-schemes')
    r = table.scan(Limit=3)
    items = r.get('Items', [])
    for item in items:
        print(f'  Scheme: {item["scheme_id"]} - {item["name"][:50]}')
    print(f'  DynamoDB: OK - {len(items)} schemes loaded')
except Exception as e:
    print('  DynamoDB:', str(e)[:120])

# Test S3 - upload & download
print('Testing S3 (upload/download)...')
try:
    s3 = s.client('s3')
    bucket = 'civicbridge-documents-929094995891'
    s3.put_object(Bucket=bucket, Key='test/hello.txt', Body=b'Hello CivicBridge!', ContentType='text/plain')
    r = s3.get_object(Bucket=bucket, Key='test/hello.txt')
    content = r['Body'].read().decode()
    s3.delete_object(Bucket=bucket, Key='test/hello.txt')
    print('  S3: OK - uploaded/downloaded/deleted test file:', content)
except Exception as e:
    print('  S3:', str(e)[:120])
