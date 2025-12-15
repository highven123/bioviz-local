# BioViz AI Configuration Setup Script
# Run this to configure Alibaba Cloud Bailian DeepSeek API

echo "Setting up BioViz AI configuration..."

# Add environment variables to ~/.zshrc
echo "" >> ~/.zshrc
echo "# BioViz AI Configuration (Alibaba Cloud Bailian)" >> ~/.zshrc
echo "export AI_PROVIDER='bailian'" >> ~/.zshrc
echo "export DASHSCOPE_API_KEY='sk-a360a14e902a42288d9517620b8d6a35'" >> ~/.zshrc
echo "export DEEPSEEK_MODEL='deepseek-v3'" >> ~/.zshrc

# Apply changes to current session
export AI_PROVIDER='bailian'
export DASHSCOPE_API_KEY='sk-a360a14e902a42288d9517620b8d6a35'
export DEEPSEEK_MODEL='deepseek-v3'

echo "✅ Configuration added to ~/.zshrc"
echo "✅ Environment variables set for current session"
echo ""
echo "Verification:"
echo "  AI_PROVIDER=$AI_PROVIDER"
echo "  DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY:0:20}..."
echo "  DEEPSEEK_MODEL=$DEEPSEEK_MODEL"
echo ""
echo "Please restart your terminal or run: source ~/.zshrc"
