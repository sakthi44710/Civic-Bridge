#!/bin/bash

# Quick Google OAuth Setup Script for CivicBridge
# This script helps you set up Google OAuth with AWS Cognito

echo "=========================================="
echo "CivicBridge - Google OAuth Quick Setup"
echo "=========================================="
echo ""

# Check if virtual environment is activated
if [[ -z "$VIRTUAL_ENV" ]]; then
    echo "⚠️  Warning: Virtual environment not activated"
    echo "   Run: source ../.venv/Scripts/activate (Windows)"
    echo "   Or: source ../.venv/bin/activate (Linux/Mac)"
    echo ""
    read -p "Continue anyway? (y/n): " continue
    if [[ $continue != "y" ]]; then
        exit 1
    fi
fi

# Install required packages
echo "📦 Installing required Python packages..."
pip install google-auth google-auth-oauthlib python-jose[cryptography] twilio -q

if [ $? -ne 0 ]; then
    echo "❌ Failed to install packages"
    exit 1
fi

echo "✅ Packages installed"
echo ""

# Run the Python setup script
echo "🚀 Starting Cognito setup..."
echo ""
python scripts/setup_cognito.py

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ Setup completed successfully!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Copy the environment variables to your .env file"
    echo "2. Add the Cognito redirect URI to Google Console"
    echo "3. Restart your backend server"
    echo ""
else
    echo ""
    echo "❌ Setup failed. Check the error messages above."
    echo ""
fi
