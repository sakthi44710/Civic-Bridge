import boto3, json

models_to_try = [
    "anthropic.claude-haiku-4-5-20251001-v1:0",
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-sonnet-20240229-v1:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "amazon.titan-text-lite-v1",
    "amazon.titan-text-express-v1",
]

b = boto3.client('bedrock-runtime', region_name='ap-south-1')

for model_id in models_to_try:
    try:
        if model_id.startswith("anthropic"):
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 10,
                "messages": [{"role": "user", "content": [{"type": "text", "text": "Hi"}]}],
            })
        else:
            body = json.dumps({
                "inputText": "Hi",
                "textGenerationConfig": {"maxTokenCount": 10}
            })
        
        r = b.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=body
        )
        result = json.loads(r['body'].read())
        if model_id.startswith("anthropic"):
            text = result['content'][0]['text']
        else:
            text = result.get('results', [{}])[0].get('outputText', str(result)[:50])
        print(f"  [OK] {model_id}: '{text[:40]}'")
        break
    except Exception as e:
        err = str(e)[:80]
        print(f"  [!!] {model_id}: {err}")
