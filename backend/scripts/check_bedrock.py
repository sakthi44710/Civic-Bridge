import boto3, json

client = boto3.client('bedrock', region_name='ap-south-1')

print("=== Anthropic Models ===")
try:
    resp = client.list_foundation_models(byProvider='Anthropic')
    for m in resp['modelSummaries']:
        mid = m['modelId']
        name = m.get('modelName', '')
        status = m.get('modelLifecycle', {}).get('status', '')
        print(f"  {mid} | {name} | {status}")
except Exception as e:
    print(f"Error: {e}")

print("\n=== All Providers ===")
try:
    resp2 = client.list_foundation_models()
    providers = set()
    for m in resp2['modelSummaries']:
        providers.add(m.get('providerName', ''))
    print(f"  {sorted(providers)}")
except Exception as e:
    print(f"Error: {e}")
