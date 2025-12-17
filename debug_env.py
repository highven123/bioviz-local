import os
import sys
from dotenv import load_dotenv

# Path to .env
env_path = os.path.join(os.getcwd(), '.env')

print(f"Loading .env from: {env_path}")
load_dotenv(env_path, override=True)

print("\n--- Environment Variables ---")
print(f"AI_PROVIDER: {os.getenv('AI_PROVIDER')}")
print(f"DEEPSEEK_API_KEY: {os.getenv('DEEPSEEK_API_KEY')}")
print(f"DASHSCOPE_API_KEY: {os.getenv('DASHSCOPE_API_KEY')}")

dk = os.getenv('DEEPSEEK_API_KEY')
bak = os.getenv('DASHSCOPE_API_KEY')

if dk:
    print(f"\nDEEPSEEK_API_KEY value: {dk[:6]}...{dk[-4:]}")
else:
    print("\nDEEPSEEK_API_KEY is NOT set or empty.")

if bak:
    print(f"DASHSCOPE_API_KEY value: {bak[:6]}...{bak[-4:]}")
else:
    print("DASHSCOPE_API_KEY is NOT set or empty.")

print("\n--- Resolution Logic ---")
final_key = dk or bak
if final_key:
     print(f"Resolved Key: {final_key[:6]}...{final_key[-4:]}")
else:
     print("Resolved Key: None")
