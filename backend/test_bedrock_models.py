import boto3, json, time

runtime = boto3.client("bedrock-runtime", region_name="ap-south-1")

models = {
    "Claude 3 Haiku (chat)": "anthropic.claude-3-haiku-20240307-v1:0",
    "APAC Sonnet 4 (smart)": "apac.anthropic.claude-sonnet-4-20250514-v1:0",
}

for name, model_id in models.items():
    print(f"\n{'='*50}")
    print(f"Testing: {name}")
    print(f"Model:   {model_id}")
    print(f"{'='*50}")

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 150,
        "messages": [{"role": "user", "content": "What is PM-KISAN scheme? Reply in 2 sentences."}]
    })

    try:
        start = time.time()
        resp = runtime.invoke_model(modelId=model_id, body=body, contentType="application/json")
        elapsed = time.time() - start
        result = json.loads(resp["body"].read())
        text = result["content"][0]["text"]
        print(f"Time:    {elapsed:.2f}s")
        print(f"Reply:   {text}")
        print(f"Status:  PASS")
    except Exception as e:
        print(f"Error:   {e}")
        print(f"Status:  FAIL")

print(f"\n{'='*50}")
print("Done!")
