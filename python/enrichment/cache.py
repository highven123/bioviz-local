"""
Cache Manager for BioViz Enrichment Framework

Simple file-based cache implementation (interface-compatible for future upgrades).
"""

from pathlib import Path
from typing import Optional


class CacheManager:
    """
    Simple cache manager.
    
    Currently uses file-based caching (implemented in sources.py).
    Interface is designed to be upgradeable to SQLite in future versions.
    """
    
    def __init__(self, cache_dir: Optional[Path] = None):
        """
        Initialize cache manager.
        
        Args:
            cache_dir: Directory for cache files
        """
        self.cache_dir = cache_dir or Path.home() / '.bioviz' / 'cache'
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def get(self, key: str) -> Optional[dict]:
        """
        Get cached item.
        
        Args:
            key: Cache key
            
        Returns:
            Cached data or None
        """
        # Placeholder for future SQL implementation
        return None
    
    def set(self, key: str, value: dict, ttl: Optional[int] = None):
        """
        Set cache item.
        
        Args:
            key: Cache key
            value: Data to cache
            ttl: Time-to-live in seconds (optional)
        """
        # Placeholder for future SQL implementation
        pass
    
    def delete(self, key: str):
        """Delete cached item"""
        pass
    
    def clear(self):
        """Clear all cache"""
        for file in self.cache_dir.glob("*"):
            if file.is_file():
                file.unlink()
