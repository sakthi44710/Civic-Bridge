try:
    import jose
    print("jose OK")
except ImportError:
    print("jose MISSING")

try:
    import httpx
    print("httpx OK")
except ImportError:
    print("httpx MISSING")

try:
    from google.oauth2 import id_token
    print("google-auth OK")
except ImportError:
    print("google-auth MISSING")
