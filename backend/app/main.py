"""
CivicBridge - AI-Powered Government Scheme Discovery Platform
FastAPI Application Entry Point
"""
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.routes import auth, users, chat, documents, schemes, applications, translate, digilocker
from app.routes import ws as websocket_routes
from app.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="CivicBridge API",
    description="AI-powered platform helping Indian citizens discover and apply for government welfare schemes through voice-first, multilingual interactions.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://localhost:8080",
        "https://*.amplifyapp.com",
        "https://d30g9gkj4z2geg.cloudfront.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(schemes.router, prefix="/api/v1")
app.include_router(applications.router, prefix="/api/v1")
app.include_router(translate.router, prefix="/api/v1")
app.include_router(digilocker.router, prefix="/api/v1")
app.include_router(websocket_routes.router, prefix="/api/v1")


# Startup: warm up shared Sarvam httpx client
@app.on_event("startup")
async def startup():
    if not settings.SARVAM_API_KEY:
        logger.warning("[Startup] SARVAM_API_KEY not set — voice pipeline will not work")
    else:
        # Pre-warm shared client so first request is fast
        from app.services.sarvam_service import sarvam_service
        sarvam_service._get_client()
        logger.info("[Startup] Sarvam AI client initialized")


# Global exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return proper JSON errors"""
    error_name = type(exc).__name__
    
    # AWS credential errors
    if "NoCredentialsError" in error_name or "CredentialRetrievalError" in error_name:
        logger.warning(f"AWS credentials not configured: {exc}")
        return JSONResponse(
            status_code=503,
            content={"detail": "AWS services not configured. Please set up AWS credentials.", "error": "aws_credentials_missing"}
        )
    
    # AWS client errors  
    if "ClientError" in error_name or "BotoCoreError" in error_name:
        logger.error(f"AWS service error: {exc}")
        return JSONResponse(
            status_code=503,
            content={"detail": "AWS service temporarily unavailable", "error": "aws_service_error"}
        )
    
    # Generic unhandled errors
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {error_name}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": "internal_error"}
    )


@app.get("/")
async def root():
    return {
        "name": "CivicBridge API",
        "version": "1.0.0",
        "status": "running",
        "description": "AI-powered Government Scheme Discovery Platform",
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/v1/languages")
async def supported_languages():
    """Get all 22 supported Indian languages"""
    from app.services.translate_service import LANGUAGE_NAMES
    return {
        "languages": [
            {"code": code, "name": name}
            for code, name in LANGUAGE_NAMES.items()
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
