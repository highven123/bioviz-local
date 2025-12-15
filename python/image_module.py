"""
Image Analysis Module for BioViz v2.0
Provides multi-modal image analysis capabilities (WB, IHC, Flow).
"""

import sys
import json
import base64
from pathlib import Path
from typing import Dict, List, Any, Optional

# Check for image processing libraries
try:
    from PIL import Image
    import io
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("[Image] Warning: Pillow not installed. Image features limited.", file=sys.stderr)


def check_image_available() -> bool:
    """Check if image processing is available."""
    return PIL_AVAILABLE


def encode_image_base64(image_path: str) -> Optional[str]:
    """
    Encode an image file to base64 for API transmission.
    
    Args:
        image_path: Path to the image file
    
    Returns:
        Base64-encoded string or None if failed
    """
    try:
        path = Path(image_path)
        if not path.exists():
            print(f"[Image] File not found: {image_path}", file=sys.stderr)
            return None
        
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        print(f"[Image] Error encoding image: {e}", file=sys.stderr)
        return None


def get_image_metadata(image_path: str) -> Dict[str, Any]:
    """
    Extract metadata from an image file.
    
    Args:
        image_path: Path to the image file
    
    Returns:
        Dictionary with image metadata
    """
    if not PIL_AVAILABLE:
        return {"status": "error", "message": "Pillow not installed"}
    
    try:
        path = Path(image_path)
        if not path.exists():
            return {"status": "error", "message": f"File not found: {image_path}"}
        
        with Image.open(path) as img:
            return {
                "status": "ok",
                "path": str(path.absolute()),
                "filename": path.name,
                "format": img.format,
                "mode": img.mode,
                "width": img.width,
                "height": img.height,
                "size_bytes": path.stat().st_size
            }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def analyze_western_blot(image_path: str, ai_client: Any = None) -> Dict[str, Any]:
    """
    Analyze a Western Blot image.
    
    If AI client is provided, uses multi-modal LLM for analysis.
    Otherwise, provides basic image info.
    
    Args:
        image_path: Path to the WB image
        ai_client: Optional AI client for multi-modal analysis
    
    Returns:
        Analysis results
    """
    metadata = get_image_metadata(image_path)
    if metadata.get("status") != "ok":
        return metadata
    
    result = {
        "status": "ok",
        "image_type": "western_blot",
        "metadata": metadata,
        "analysis": None
    }
    
    # Try multimodal AI analysis
    base64_image = encode_image_base64(image_path)
    if base64_image:
        ai_result = analyze_image_with_multimodal_ai(
            base64_image, 
            "western_blot",
            "Analyze this Western Blot image. Identify the protein bands, their relative intensities, and any notable observations. If lane labels are visible, include them."
        )
        if ai_result:
            result["analysis"] = ai_result
    
    return result


def analyze_image_with_multimodal_ai(
    base64_image: str,
    image_type: str,
    prompt: str
) -> Optional[Dict[str, Any]]:
    """
    Analyze an image using multimodal AI (GPT-4V, Qwen-VL, etc.).
    
    Args:
        base64_image: Base64-encoded image
        image_type: Type of image for context
        prompt: Analysis prompt
    
    Returns:
        Analysis result dict or None
    """
    import os
    
    # Check for available AI providers
    provider = os.environ.get("AI_PROVIDER", "").lower()
    
    try:
        if provider == "openai" or os.environ.get("OPENAI_API_KEY"):
            return _analyze_with_openai(base64_image, prompt)
        elif provider == "qwen" or os.environ.get("DASHSCOPE_API_KEY"):
            return _analyze_with_qwen(base64_image, prompt)
        else:
            print(f"[Image] No multimodal AI configured. Set OPENAI_API_KEY or DASHSCOPE_API_KEY.", file=sys.stderr)
            return {
                "description": "Multimodal AI not configured. Please set OPENAI_API_KEY or DASHSCOPE_API_KEY.",
                "ai_analyzed": False
            }
    except Exception as e:
        print(f"[Image] Multimodal AI error: {e}", file=sys.stderr)
        return {"description": f"AI analysis error: {str(e)}", "ai_analyzed": False}


def _analyze_with_openai(base64_image: str, prompt: str) -> Dict[str, Any]:
    """Analyze image using OpenAI GPT-4V."""
    import os
    from openai import OpenAI
    
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_image}",
                            "detail": "high"
                        }
                    }
                ]
            }
        ],
        max_tokens=500
    )
    
    analysis_text = response.choices[0].message.content
    print(f"[Image] GPT-4V analysis complete", file=sys.stderr)
    
    return {
        "description": analysis_text,
        "model": "gpt-4o",
        "ai_analyzed": True
    }


def _analyze_with_qwen(base64_image: str, prompt: str) -> Dict[str, Any]:
    """Analyze image using Qwen-VL (DashScope API)."""
    import os
    from openai import OpenAI
    
    client = OpenAI(
        api_key=os.environ.get("DASHSCOPE_API_KEY"),
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
    )
    
    response = client.chat.completions.create(
        model="qwen-vl-max",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        max_tokens=500
    )
    
    analysis_text = response.choices[0].message.content
    print(f"[Image] Qwen-VL analysis complete", file=sys.stderr)
    
    return {
        "description": analysis_text,
        "model": "qwen-vl-max",
        "ai_analyzed": True
    }


def analyze_flow_cytometry(image_path: str, ai_client: Any = None) -> Dict[str, Any]:
    """
    Analyze a Flow Cytometry scatter plot.
    
    Args:
        image_path: Path to the flow plot image
        ai_client: Optional AI client for multi-modal analysis
    
    Returns:
        Analysis results
    """
    metadata = get_image_metadata(image_path)
    if metadata.get("status") != "ok":
        return metadata
    
    result = {
        "status": "ok",
        "image_type": "flow_cytometry",
        "metadata": metadata,
        "analysis": None
    }
    
    # Try multimodal AI analysis
    base64_image = encode_image_base64(image_path)
    if base64_image:
        ai_result = analyze_image_with_multimodal_ai(
            base64_image, 
            "flow_cytometry",
            "Analyze this flow cytometry scatter plot. Identify distinct cell populations, estimate their percentages, and describe the gating strategy if visible."
        )
        if ai_result:
            result["analysis"] = ai_result
    
    return result


def analyze_histology(image_path: str, ai_client: Any = None) -> Dict[str, Any]:
    """
    Analyze a histology/IHC image.
    
    Args:
        image_path: Path to the histology image
        ai_client: Optional AI client for multi-modal analysis
    
    Returns:
        Analysis results
    """
    metadata = get_image_metadata(image_path)
    if metadata.get("status") != "ok":
        return metadata
    
    result = {
        "status": "ok",
        "image_type": "histology",
        "metadata": metadata,
        "analysis": None
    }
    
    # Try multimodal AI analysis
    base64_image = encode_image_base64(image_path)
    if base64_image:
        ai_result = analyze_image_with_multimodal_ai(
            base64_image, 
            "histology",
            "Analyze this histology/IHC image. Describe the tissue structure, staining pattern, identify positive and negative regions, and estimate the percentage of positive staining if applicable."
        )
        if ai_result:
            result["analysis"] = ai_result
    
    return result


# Image storage management
class ImageStore:
    """Manages uploaded images for a project."""
    
    def __init__(self, storage_dir: Optional[Path] = None):
        self.storage_dir = storage_dir or (Path.home() / ".bioviz_local" / "images")
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.images: Dict[str, Dict[str, Any]] = {}
    
    def add_image(self, image_path: str, image_type: str, metadata: Dict[str, Any] = None) -> str:
        """
        Add an image to the store.
        
        Args:
            image_path: Path to the image file
            image_type: Type of image (western_blot, flow_cytometry, histology)
            metadata: Optional additional metadata
        
        Returns:
            Image ID
        """
        import hashlib
        import shutil
        
        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        # Generate unique ID
        with open(path, "rb") as f:
            file_hash = hashlib.md5(f.read()).hexdigest()[:8]
        
        image_id = f"{image_type}_{file_hash}"
        
        # Copy to storage
        dest_path = self.storage_dir / f"{image_id}{path.suffix}"
        shutil.copy2(path, dest_path)
        
        # Store metadata
        self.images[image_id] = {
            "id": image_id,
            "type": image_type,
            "original_path": str(path),
            "stored_path": str(dest_path),
            "filename": path.name,
            "metadata": metadata or {}
        }
        
        print(f"[Image] Added image: {image_id}", file=sys.stderr)
        return image_id
    
    def get_image(self, image_id: str) -> Optional[Dict[str, Any]]:
        """Get image info by ID."""
        return self.images.get(image_id)
    
    def list_images(self, image_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all images, optionally filtered by type."""
        if image_type:
            return [img for img in self.images.values() if img["type"] == image_type]
        return list(self.images.values())


# Singleton instance
_image_store: Optional[ImageStore] = None

def get_image_store() -> ImageStore:
    """Get or create the image store singleton."""
    global _image_store
    if _image_store is None:
        _image_store = ImageStore()
    return _image_store


# Handler functions for bio_core integration
def handle_upload_image(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle UPLOAD_IMAGE command from frontend."""
    image_path = payload.get("path")
    image_type = payload.get("type", "unknown")
    metadata = payload.get("metadata", {})
    
    if not image_path:
        return {"status": "error", "message": "No image path provided"}
    
    try:
        store = get_image_store()
        image_id = store.add_image(image_path, image_type, metadata)
        image_info = store.get_image(image_id)
        
        return {
            "status": "ok",
            "image_id": image_id,
            "image": image_info
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def handle_analyze_image(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle ANALYZE_IMAGE command from frontend."""
    image_id = payload.get("image_id")
    image_path = payload.get("path")
    image_type = payload.get("type", "unknown")
    
    # Get path from store if ID provided
    if image_id:
        store = get_image_store()
        image_info = store.get_image(image_id)
        if image_info:
            image_path = image_info["stored_path"]
            image_type = image_info["type"]
    
    if not image_path:
        return {"status": "error", "message": "No image path or ID provided"}
    
    # Route to appropriate analyzer
    if image_type == "western_blot":
        return analyze_western_blot(image_path)
    elif image_type == "flow_cytometry":
        return analyze_flow_cytometry(image_path)
    elif image_type == "histology":
        return analyze_histology(image_path)
    else:
        return get_image_metadata(image_path)


def handle_list_images(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle LIST_IMAGES command from frontend."""
    image_type = payload.get("type")
    store = get_image_store()
    
    return {
        "status": "ok",
        "images": store.list_images(image_type)
    }
