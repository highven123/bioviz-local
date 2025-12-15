# AI Configuration Guide

## Quick Start

BioViz Local supports multiple AI providers. Follow these steps to configure:

### 1. Create `.env` file

```bash
cp .env.example .env
```

### 2. Edit `.env` and add your API key

For **DeepSeek** (recommended, cost-effective):
```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-actual-api-key-here
```

For **OpenAI**:
```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-key-here
```

For **Ollama** (local, free):
```bash
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3
```

### 3. Restart the application

```bash
npm run tauri dev
```

## Getting API Keys

### DeepSeek
1. Visit: https://platform.deepseek.com/
2. Sign up and get your API key
3. Very cost-effective (~$0.14 per million tokens)

### OpenAI
1. Visit: https://platform.openai.com/
2. Create an account and add payment method
3. Generate API key in API settings

### Ollama (Local)
1. Install Ollama: https://ollama.ai/
2. Run: `ollama pull llama3`
3. Start server: `ollama serve`
4. No API key needed!

## Troubleshooting

**Error: "Authentication Fails"**
- Double-check your API key is correct
- Make sure `.env` file is in the project root
- Restart the application after changing `.env`

**Error: "API key not set"**
- Make sure you created `.env` file (not just `.env.example`)
- Check that the environment variable name matches the provider

## Note on API Key Security

⚠️ **IMPORTANT**: Never commit your `.env` file to git!

The `.env` file is already in `.gitignore` to prevent accidental commits.
