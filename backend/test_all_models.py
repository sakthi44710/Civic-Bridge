import boto3, json, time

b = boto3.client('bedrock-runtime', region_name='ap-south-1')

models = [
    "deepseek.v3.2",
    "us.meta.llama4-scout-17b-instruct-v1:0",
    "us.meta.llama4-maverick-17b-instruct-v1:0",
    "mistral.mistral-7b-instruct-v0:2",
    "mistral.mixtral-8x7b-instruct-v0:1",
]

for m in models:
    try:
        start = time.time()
        r = b.converse(
            modelId=m,
            messages=[{"role": "user", "content": [{"text": "Hi"}]}],
            inferenceConfig={"maxTokens": 10}
        )
        elapsed = time.time() - start
        text = r["output"]["message"]["content"][0]["text"]
        print(f"  [OK]   {m}  ({elapsed:.1f}s)  -> {text[:40]}")
    except Exception as e:
        err = str(e)[:90]
        print(f"  [FAIL] {m}  -> {err}")
