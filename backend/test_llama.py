import time
from importlib import reload
import app.config
reload(app.config)
from app.services.bedrock_service import BedrockService

svc = BedrockService()
print(f"Chat model: {svc.chat_model}")
print(f"Smart model: {svc.smart_model}")

t = time.time()
r = svc.chat("Hello, I need help with PM-KISAN scheme", language="en")
elapsed = time.time() - t

print(f"Time: {elapsed:.2f}s")
print(f"Intent: {r.get('intent', '?')}")
print(f"Message: {r.get('message', '')[:150]}")
print("OK")
