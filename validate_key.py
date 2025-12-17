import os
import sys
from openai import OpenAI

api_key = "sk-adb242a63e564152b9a26dec5b950af7"

def test_deepseek():
    print(f"Testing DeepSeek Official API with key: {api_key[:6]}...")
    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    try:
        client.models.list()
        print("✅ DeepSeek Official: SUCCESS")
        return True
    except Exception as e:
        print(f"❌ DeepSeek Official: FAILED - {e}")
        return False

def test_bailian():
    print(f"Testing Aliyun Bailian API with key: {api_key[:6]}...")
    client = OpenAI(api_key=api_key, base_url="https://dashscope.aliyuncs.com/compatible-mode/v1")
    try:
        # Bailian might not support models.list() the same way, try a simple chat
        client.chat.completions.create(
            model="deepseek-v3.2-exp", # Updated to v3.2-exp
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1
        )
        print("✅ Aliyun Bailian: SUCCESS")
        return True
    except Exception as e:
        print(f"❌ Aliyun Bailian: FAILED - {e}")
        return False

if __name__ == "__main__":
    is_deepseek = test_deepseek()
    is_bailian = False
    if not is_deepseek:
        is_bailian = test_bailian()
    
    if is_deepseek:
        print("\nCONCLUSION: This is a DeepSeek Official key.")
    elif is_bailian:
        print("\nCONCLUSION: This is an Aliyun Bailian key.")
    else:
        print("\nCONCLUSION: Key is invalid for both providers.")
