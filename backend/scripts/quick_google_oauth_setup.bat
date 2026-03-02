@echo off
REM Quick Google OAuth Setup Script for CivicBridge (Windows)

echo ==========================================
echo CivicBridge - Google OAuth Quick Setup
echo ==========================================
echo.

REM Check if virtual environment is activated
if "%VIRTUAL_ENV%"=="" (
    echo WARNING: Virtual environment not activated
    echo    Run: ..\.venv\Scripts\activate
    echo.
    set /p continue="Continue anyway? (y/n): "
    if /i not "%continue%"=="y" exit /b 1
)

REM Install required packages
echo Installing required Python packages...
pip install google-auth google-auth-oauthlib python-jose[cryptography] twilio -q

if errorlevel 1 (
    echo Failed to install packages
    exit /b 1
)

echo Packages installed
echo.

REM Run the Python setup script
echo Starting Cognito setup...
echo.
python scripts\setup_cognito.py

if errorlevel 0 (
    echo.
    echo ==========================================
    echo Setup completed successfully!
    echo ==========================================
    echo.
    echo Next steps:
    echo 1. Copy the environment variables to your .env file
    echo 2. Add the Cognito redirect URI to Google Console
    echo 3. Restart your backend server
    echo.
) else (
    echo.
    echo Setup failed. Check the error messages above.
    echo.
)

pause
