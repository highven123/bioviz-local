"""
BioViz Local - AI Core Engine
Handles AI interactions with Logic Lock safety protocol.
Supports: OpenAI, DeepSeek, Ollama, and other OpenAI-compatible APIs.
"""

import os
import json
import sys
from typing import Any, Dict, List, Optional

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Load from project root .env file
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    load_dotenv(env_path)
    print(f"[AI Core] Loaded environment from: {env_path}", file=sys.stderr)
except ImportError:
    print("[AI Core] Warning: python-dotenv not installed. Environment variables must be set manually.", file=sys.stderr)

from openai import OpenAI
from ai_protocol import AIAction, SafetyLevel, store_proposal
from ai_tools import (
    get_openai_tools_schema,
    get_tool,
    execute_tool,
    get_green_zone_tools,
    get_yellow_zone_tools
)


# ============================================
# Flexible API Configuration
# ============================================
# Configure via environment variables:
# 
# For Alibaba Cloud Bailian DeepSeek:
#   export DEEPSEEK_API_KEY="your-key-here"
#   export AI_PROVIDER="bailian"
#
# For DeepSeek Official:
#   export DEEPSEEK_API_KEY="your-key-here"
#   export AI_PROVIDER="deepseek"
#
# For OpenAI:
#   export OPENAI_API_KEY="your-key-here"
#   export AI_PROVIDER="openai"
#
# For Ollama (local):
#   export AI_PROVIDER="ollama"
#   export OLLAMA_BASE_URL="http://localhost:11434/v1"  # optional
# ============================================

def get_ai_client() -> OpenAI:
    """
    Initialize AI client based on environment configuration.
    """
    provider = os.getenv("AI_PROVIDER", "ollama").lower()
    
    if provider == "bailian":
        # Alibaba Cloud Bailian DeepSeek API
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            print("[AI Core] Warning: DEEPSEEK_API_KEY not set. Using placeholder.", file=sys.stderr)
            api_key = "sk-placeholder"
        
        return OpenAI(
            api_key=api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
    
    elif provider == "deepseek":
        # DeepSeek Official API
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            print("[AI Core] Warning: DEEPSEEK_API_KEY not set. Using placeholder.", file=sys.stderr)
            api_key = "sk-placeholder"
        
        return OpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com"
        )
    
    elif provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        
        return OpenAI(api_key=api_key)
    
    elif provider == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        return OpenAI(
            api_key="ollama",  # Ollama doesn't require a real key
            base_url=base_url
        )
    
    else:
        # Custom provider
        api_key = os.getenv("CUSTOM_API_KEY", "placeholder")
        base_url = os.getenv("CUSTOM_BASE_URL", "http://localhost:11434/v1")
        return OpenAI(api_key=api_key, base_url=base_url)


def get_model_name() -> str:
    """Get the model name based on provider."""
    provider = os.getenv("AI_PROVIDER", "ollama").lower()
    
    if provider in ["bailian", "deepseek"]:
        return os.getenv("DEEPSEEK_MODEL", "deepseek-v3")
    elif provider == "openai":
        return os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    elif provider == "ollama":
        return os.getenv("OLLAMA_MODEL", "llama3")
    else:
        return os.getenv("CUSTOM_MODEL", "gpt-3.5-turbo")


# Initialize client
client = get_ai_client()
DEFAULT_MODEL = get_model_name()


# --- System Prompt ---

SYSTEM_PROMPT = """You are BioViz AI, an intelligent assistant for biological pathway analysis.

You help users:
- Visualize gene expression data on KEGG pathways
- Understand pathway statistics and biological significance
- Navigate and explore pathway templates

Available tools:
- render_pathway: Color a pathway with expression data
- get_pathway_stats: Get statistics for a pathway
- list_pathways: List available pathway templates
- explain_pathway: Describe what a pathway does
- update_thresholds: Modify analysis thresholds (requires confirmation)
- export_data: Export data to file (requires confirmation)

When users ask about pathways or data visualization, use the appropriate tools.
Be concise and helpful. Focus on biological insights."""


# --- Main Processing Function ---

def process_query(
    user_query: str,
    history: Optional[List[Dict[str, str]]] = None,
    context: Optional[Dict[str, Any]] = None
) -> AIAction:
    """
    Process a user query through the Logic Lock system.
    
    Args:
        user_query: The user's message
        history: Optional conversation history
        context: Optional context (e.g., current expression data)
    
    Returns:
        AIAction indicating CHAT, EXECUTE, or PROPOSAL
    """
    history = history or []
    context = context or {}
    
    # Build messages
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    # Add history
    for msg in history[-10:]:  # Keep last 10 messages
        messages.append(msg)
    
    # Add current query
    messages.append({"role": "user", "content": user_query})
    
    # Get tools
    tools = get_openai_tools_schema()
    
    try:
        # Call AI API
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )
        
        message = response.choices[0].message
        
        # --- Logic Lock Decision ---
        
        # Case 1: Pure text response (no tool call)
        if not message.tool_calls:
            return AIAction.chat(message.content or "I'm not sure how to help with that.")
        
        # Case 2: Tool call requested
        tool_call = message.tool_calls[0]
        tool_name = tool_call.function.name
        tool_args = json.loads(tool_call.function.arguments)
        
        tool_def = get_tool(tool_name)
        if not tool_def:
            return AIAction.chat(f"Unknown tool requested: {tool_name}")
        
        # Case 2a: Green Zone - Execute immediately
        if tool_def.safety_level == SafetyLevel.GREEN:
            try:
                # Inject context if needed (e.g., current expression data)
                if "gene_expression" in tool_args and not tool_args.get("gene_expression"):
                    if context.get("gene_expression"):
                        tool_args["gene_expression"] = context["gene_expression"]
                
                result = execute_tool(tool_name, tool_args)
                
                # Generate summary based on tool
                if tool_name == "render_pathway":
                    stats = result.get("statistics", {})
                    summary = f"Rendered pathway with {stats.get('total_nodes', 0)} nodes: {stats.get('upregulated', 0)} upregulated, {stats.get('downregulated', 0)} downregulated."
                elif tool_name == "get_pathway_stats":
                    summary = f"Statistics: {result.get('upregulated', 0)} upregulated, {result.get('downregulated', 0)} downregulated out of {result.get('total_nodes', 0)} nodes."
                elif tool_name == "list_pathways":
                    summary = f"Found {len(result)} available pathway templates."
                elif tool_name == "explain_pathway":
                    summary = result
                else:
                    summary = f"Executed {tool_name} successfully."
                
                return AIAction.execute(tool_name, tool_args, result, summary)
                
            except Exception as e:
                return AIAction.chat(f"Error executing {tool_name}: {str(e)}")
        
        # Case 2b: Yellow Zone - Create proposal (DO NOT EXECUTE)
        elif tool_def.safety_level == SafetyLevel.YELLOW:
            # Determine reason for confirmation
            if tool_name == "update_thresholds":
                reason = "This will modify your analysis thresholds, which may affect all visualizations."
            elif tool_name == "export_data":
                reason = f"This will write data to: {tool_args.get('output_path', 'unknown path')}"
            else:
                reason = "This action may modify your data or settings."
            
            proposal = AIAction.proposal(tool_name, tool_args, reason)
            store_proposal(proposal)  # Store for later execution
            return proposal
        
        else:
            return AIAction.chat(f"Unknown safety level for tool: {tool_name}")
    
    except Exception as e:
        error_msg = str(e)
        print(f"[AI Core] Error: {error_msg}", file=sys.stderr)
        return AIAction.chat(f"Sorry, I encountered an error: {error_msg}")


def execute_proposal(proposal_id: str, context: Optional[Dict[str, Any]] = None) -> AIAction:
    """
    Execute a previously proposed action after user confirmation.
    
    Args:
        proposal_id: The UUID of the proposal to execute
        context: Optional context data
    
    Returns:
        AIAction with execution result
    """
    from ai_protocol import get_proposal, remove_proposal
    
    proposal = get_proposal(proposal_id)
    if not proposal:
        return AIAction.chat(f"Proposal {proposal_id} not found or expired.")
    
    try:
        # Execute the tool
        result = execute_tool(proposal.tool_name, proposal.tool_args)
        
        # Remove from pending
        remove_proposal(proposal_id)
        
        return AIAction.execute(
            proposal.tool_name,
            proposal.tool_args,
            result,
            f"Confirmed and executed: {proposal.tool_name}"
        )
        
    except Exception as e:
        return AIAction.chat(f"Error executing confirmed proposal: {str(e)}")


def reject_proposal(proposal_id: str) -> AIAction:
    """
    Reject a proposal (remove without executing).
    
    Args:
        proposal_id: The UUID of the proposal to reject
    
    Returns:
        AIAction confirming rejection
    """
    from ai_protocol import remove_proposal
    
    proposal = remove_proposal(proposal_id)
    if proposal:
        return AIAction.chat(f"Action cancelled: {proposal.tool_name}")
    else:
        return AIAction.chat(f"Proposal {proposal_id} not found.")
