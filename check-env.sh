#!/bin/bash
# Quick test script to verify environment variables are set

echo "=== Environment Variable Check ==="
echo "AI_PROVIDER: ${AI_PROVIDER:-NOT SET}"
echo "DASHSCOPE_API_KEY: ${DASHSCOPE_API_KEY:0:20}..."
echo "DEEPSEEK_MODEL: ${DEEPSEEK_MODEL:-NOT SET}"
echo ""

if [ -z "$AI_PROVIDER" ]; then
    echo "❌ AI_PROVIDER is not set!"
    echo "Please run: source ~/.zshrc"
    exit 1
fi

if [ -z "$DASHSCOPE_API_KEY" ]; then
    echo "❌ DASHSCOPE_API_KEY is not set!"
    echo "Please run: source ~/.zshrc"
    exit 1
fi

echo "✅ Environment variables are set correctly"
echo ""
echo "Now restart the app with:"
echo "  npm run tauri dev"
