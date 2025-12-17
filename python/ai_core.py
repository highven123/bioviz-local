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
    load_dotenv(env_path, override=True)
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
    print(f"[AI Core] Initializing AI Client. Provider: {provider}", file=sys.stderr)
    
    if provider == "bailian":
        # Support both DASHSCOPE_API_KEY (official) and DEEPSEEK_API_KEY (our convention)
        # Prioritize DEEPSEEK_API_KEY as it is explicitly set in our .env
        api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
        
        # Debug: Print masked key
        if api_key:
            masked_key = f"{api_key[:6]}...{api_key[-4:]}" if len(api_key) > 10 else "***"
            print(f"[AI Core] Using API Key: {masked_key}", file=sys.stderr)
        else:
            print("[AI Core] No API Key found for bailian!", file=sys.stderr)

        if not api_key:
            print("[AI Core] Warning: DASHSCOPE_API_KEY or DEEPSEEK_API_KEY not set. Using placeholder.", file=sys.stderr)
            api_key = "sk-placeholder"
        
        return OpenAI(
            api_key=api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            timeout=120.0  # 增加超时时间到 120 秒
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
        return os.getenv("DEEPSEEK_MODEL", "deepseek-v3.2-exp")
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

**IMPORTANT: If you see a "CURRENT CONTEXT" section below, it means the user is viewing a specific pathway with loaded data. You should:**
1. **Analyze the provided context directly** - Don't ask for data that's already in the context
2. **Reference specific numbers** - Use the statistics (Total Nodes, Upregulated, Downregulated) in your analysis
3. **Mention specific genes** - Discuss the genes and their expression values
4. **Provide biological insights** - Explain what the expression patterns mean for this specific pathway

**IMPORTANT: When you execute a tool (like render_pathway), you MUST:**
1. **Acknowledge the execution** - Confirm what you did
2. **Analyze the results** - Provide insights based on the tool's output
3. **Answer the user's question** - Don't just say "tool executed", explain what the results mean

Available tools:
- render_pathway: Color a pathway with expression data
- get_pathway_stats: Get statistics for a pathway
- list_pathways: List available pathway templates
- explain_pathway: Describe what a pathway does
- update_thresholds: Modify analysis thresholds (requires confirmation)
- export_data: Export data to file (requires confirmation)

When users ask about "current pathway" or "this pathway", they are referring to the pathway in the CURRENT CONTEXT section.
Be concise and helpful. Focus on biological insights."""


# --- Main Processing Function ---

def process_query(
    user_query: str,
    history: Optional[List[Dict[str, str]]] = None,
    context: Optional[Dict[str, Any]] = None
) -> AIAction:
    """
    Process a user query through the AI Logic Lock system.
    
    Args:
        user_query: The user's question/request
        history: Previous conversation messages
        context: Optional context data (e.g., current pathway, gene expression data)
    
    Returns:
        AIAction indicating what the AI wants to do
    """
    history = history or []
    context = context or {}
    
    # Debug: Log context data
    print(f"[AI Core] Processing query: {user_query[:50]}...", file=sys.stderr)
    if context:
        print(f"[AI Core] Context keys: {list(context.keys())}", file=sys.stderr)
        if 'pathway' in context and context['pathway']:
            pathway_id = context['pathway'].get('id', 'unknown')
            pathway_name = context['pathway'].get('name', 'unknown')
            print(f"[AI Core] Current pathway: {pathway_id} - {pathway_name}", file=sys.stderr)
        if 'volcanoData' in context:
            print(f"[AI Core] Volcano data points: {len(context.get('volcanoData', []))}", file=sys.stderr)
    else:
        print(f"[AI Core] No context provided", file=sys.stderr)
    
    # Build system message with context awareness
    system_message = SYSTEM_PROMPT
    
    # Add context information to system message if available
    if context and context.get('pathway'):
        pathway = context['pathway']
        pathway_info = f"\n\n**CURRENT CONTEXT:**\n"
        pathway_name = pathway.get('title') or pathway.get('name', 'Unknown')
        pathway_info += f"- Current Pathway: {pathway_name} (ID: {pathway.get('id', 'unknown')})\n"
        
        if context.get('statistics'):
            stats = context['statistics']
            pathway_info += f"- Total Nodes: {stats.get('total_nodes', 0)}\n"
            pathway_info += f"- Upregulated: {stats.get('upregulated', 0)}\n"
            pathway_info += f"- Downregulated: {stats.get('downregulated', 0)}\n"
        
        if context.get('volcanoData'):
            volcano_data = context['volcanoData']
            pathway_info += f"- Gene Expression Data: {len(volcano_data)} genes loaded\n"
            
            # Extract significant genes for enrichment analysis
            significant_genes = [
                gene.get('gene') for gene in volcano_data 
                if gene.get('status') in ['UP', 'DOWN']
            ]
            
            if significant_genes:
                pathway_info += f"- Significant Genes ({len(significant_genes)}): {', '.join(significant_genes[:10])}"
                if len(significant_genes) > 10:
                    pathway_info += f" ...and {len(significant_genes) - 10} more\n"
                else:
                    pathway_info += "\n"
                
                pathway_info += f"\n**TIP**: If user asks about pathway enrichment or which pathways are most significant, use the `run_enrichment` tool with this gene list: {significant_genes}\n"
            
            # Show ALL gene expression data, not just top hits
            pathway_info += "\n**Gene Expression Values:**\n"
            for gene in volcano_data:
                gene_name = gene.get('gene', 'unknown')
                logfc = gene.get('x', 0)
                status = gene.get('status', 'NS')
                pathway_info += f"  - {gene_name}: LogFC={logfc:.2f} ({status})\n"
        
        system_message += pathway_info
        print(f"[AI Core] Added context to system message: {pathway_name}", file=sys.stderr)
    
    # Handle multi-sample context for time-series comparison
    if context and context.get('multiSample'):
        sample_groups = context.get('sampleGroups', [])
        expression_data = context.get('expressionData', {})
        
        multi_info = f"\n\n**MULTI-SAMPLE TIME-SERIES DATA:**\n"
        multi_info += f"- Sample Groups: {', '.join(sample_groups)}\n\n"
        
        for group in sample_groups:
            group_data = expression_data.get(group, [])
            if group_data:
                multi_info += f"**{group} Expression Data:**\n"
                # Sort by absolute logfc
                sorted_data = sorted(group_data, key=lambda x: abs(x.get('logfc', 0)), reverse=True)
                for gene in sorted_data[:10]:  # Top 10 genes
                    gene_name = gene.get('gene', 'unknown')
                    logfc = gene.get('logfc', 0)
                    pvalue = gene.get('pvalue', 1)
                    status = "UP" if logfc > 0 and pvalue < 0.05 else ("DOWN" if logfc < 0 and pvalue < 0.05 else "NS")
                    multi_info += f"  - {gene_name}: LogFC={logfc:.2f}, P={pvalue:.4f} ({status})\n"
                multi_info += "\n"
        
        multi_info += """
**对于以上多时间点数据，请直接提供详细的文本分析报告，包括：**
1. 🔺 持续上调的关键基因及其生物学意义
2. 🔻 持续下调的基因及可能原因
3. 📈 时间依赖性表达模式（早期vs晚期）
4. 🧬 涉及的主要生物学通路（如糖酵解、缺氧反应等）
5. 💡 整体生物学解读和假设

**注意：请直接用文本回答，不要调用工具。用中文详细解释，格式清晰。**
"""
        system_message += multi_info
        print(f"[AI Core] Added multi-sample context: {len(sample_groups)} groups", file=sys.stderr)
    
    messages = [{"role": "system", "content": system_message}]
    
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
        
        # Safely parse tool arguments
        try:
            args_str = tool_call.function.arguments
            print(f"[AI Core] Tool arguments string: {args_str[:200] if args_str else 'empty'}", file=sys.stderr)
            tool_args = json.loads(args_str) if args_str else {}
        except json.JSONDecodeError as e:
            error_detail = f"{str(e)} at position {e.pos}" if hasattr(e, 'pos') else str(e)
            print(f"[AI Core] JSON decode error: {error_detail}", file=sys.stderr)
            print(f"[AI Core] Raw arguments (full): {tool_call.function.arguments}", file=sys.stderr)
            return AIAction.chat(
                f"遇到工具参数解析错误。\n"
                f"错误详情: {error_detail}\n"
                f"原始参数: {args_str[:100] if args_str else 'empty'}...\n"
                f"这可能是 API 的临时问题，请重试或换个方式提问。"
            )
        
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
