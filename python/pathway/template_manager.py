"""
Unified Pathway Template Manager

Manages pathway templates from multiple sources with:
- Pre-bundled templates (assets/templates/)
- User cache (~/.bioviz/cache/pathways/)
- Automatic download and caching
- Cross-source pathway search
"""

import logging
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime


class PathwayTemplateManager:
    """Unified pathway template management across multiple sources."""
    
    def __init__(self, bundled_dir: Optional[Path] = None, cache_dir: Optional[Path] = None):
        """
        Initialize template manager.
        
        Args:
            bundled_dir: Path to bundled templates (default: assets/templates)
            cache_dir: Path to cache directory (default: ~/.bioviz/cache/pathways)
        """
        # Setup directories
        if bundled_dir is None:
            # Try to find assets/templates relative to this file
            current_file = Path(__file__).resolve()
            project_root = current_file.parent.parent.parent
            bundled_dir = project_root / "assets" / "templates"
        
        self.bundled_dir = Path(bundled_dir)
        self.cache_dir = Path(cache_dir or Path.home() / ".bioviz" / "cache" / "pathways")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Supported sources
        self.sources = ['kegg', 'reactome', 'wikipathways', 'go_bp']
        
        logging.info(f"PathwayTemplateManager initialized:")
        logging.info(f"  Bundled: {self.bundled_dir}")
        logging.info(f"  Cache: {self.cache_dir}")
    
    def get_template(self, pathway_id: str, source: str) -> Tuple[Optional[Dict], str]:
        """
        Get pathway template with fallback strategy.
        
        Args:
            pathway_id: Pathway identifier (e.g., 'hsa00010', 'R-HSA-168256')
            source: Source name ('kegg', 'reactome', 'wikipathways', 'go_bp')
        
        Returns:
            Tuple of (template_dict, source_type) where source_type is:
            - 'bundled': From pre-packaged templates
            - 'cached': From user cache
            - None: Not found
        """
        source = source.lower()
        
        # 1. Check bundled templates
        bundled_path = self.bundled_dir / source / f"{pathway_id}.json"
        if bundled_path.exists():
            logging.info(f"Template found in bundled: {pathway_id} ({source})")
            try:
                with open(bundled_path, 'r', encoding='utf-8') as f:
                    return json.load(f), 'bundled'
            except Exception as e:
                logging.error(f"Failed to load bundled template: {e}")
        
        # 2. Check user cache
        cache_path = self.cache_dir / source / f"{pathway_id}.json"
        if cache_path.exists():
            logging.info(f"Template found in cache: {pathway_id} ({source})")
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    return json.load(f), 'cached'
            except Exception as e:
                logging.error(f"Failed to load cached template: {e}")
        
        # 3. Not found
        logging.info(f"Template not found locally: {pathway_id} ({source})")
        return None, None
    
    def save_to_cache(self, pathway_id: str, source: str, template: Dict) -> bool:
        """
        Save template to user cache.
        
        Args:
            pathway_id: Pathway identifier
            source: Source name
            template: Template dictionary
        
        Returns:
            True if saved successfully
        """
        source = source.lower()
        cache_source_dir = self.cache_dir / source
        cache_source_dir.mkdir(parents=True, exist_ok=True)
        
        cache_path = cache_source_dir / f"{pathway_id}.json"
        
        try:
            # Add metadata
            template['_cache_metadata'] = {
                'cached_at': datetime.now().isoformat(),
                'pathway_id': pathway_id,
                'source': source
            }
            
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(template, f, indent=2, ensure_ascii=False)
            
            logging.info(f"Cached template: {pathway_id} ({source})")
            return True
        except Exception as e:
            logging.error(f"Failed to cache template: {e}")
            return False
    
    def list_available(self, source: str) -> List[Dict[str, str]]:
        """
        List all available templates for a source.
        
        Args:
            source: Source name
        
        Returns:
            List of dicts with 'id', 'name', 'location' keys
        """
        source = source.lower()
        available = []
        
        # Bundled templates
        bundled_source_dir = self.bundled_dir / source
        if bundled_source_dir.exists():
            for template_file in bundled_source_dir.glob("*.json"):
                pathway_id = template_file.stem
                try:
                    with open(template_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        available.append({
                            'id': pathway_id,
                            'name': data.get('name') or data.get('title', pathway_id),
                            'location': 'bundled'
                        })
                except Exception as e:
                    logging.warning(f"Failed to read bundled template {template_file}: {e}")
        
        # Cached templates
        cache_source_dir = self.cache_dir / source
        if cache_source_dir.exists():
            for template_file in cache_source_dir.glob("*.json"):
                pathway_id = template_file.stem
                # Skip if already in bundled
                if any(t['id'] == pathway_id for t in available):
                    continue
                try:
                    with open(template_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        available.append({
                            'id': pathway_id,
                            'name': data.get('name') or data.get('title', pathway_id),
                            'location': 'cached'
                        })
                except Exception as e:
                    logging.warning(f"Failed to read cached template {template_file}: {e}")
        
        return available
    
    def search_across_sources(self, pathway_name: str) -> Dict[str, List[str]]:
        """
        Search for a pathway name across all sources.
        
        Args:
            pathway_name: Pathway name to search for (case-insensitive)
        
        Returns:
            Dict mapping source name to list of matching pathway IDs
        """
        results = {}
        search_term = pathway_name.lower()
        
        for source in self.sources:
            matches = []
            available = self.list_available(source)
            
            for template_info in available:
                if search_term in template_info['name'].lower():
                    matches.append(template_info['id'])
            
            if matches:
                results[source] = matches
        
        return results
    
    def clear_cache(self, source: Optional[str] = None) -> int:
        """
        Clear cached templates.
        
        Args:
            source: Clear specific source (None = all sources)
        
        Returns:
            Number of files deleted
        """
        deleted_count = 0
        
        if source:
            # Clear specific source
            cache_source_dir = self.cache_dir / source.lower()
            if cache_source_dir.exists():
                for template_file in cache_source_dir.glob("*.json"):
                    template_file.unlink()
                    deleted_count += 1
                logging.info(f"Cleared {deleted_count} cached templates for {source}")
        else:
            # Clear all sources
            for src in self.sources:
                cache_source_dir = self.cache_dir / src
                if cache_source_dir.exists():
                    for template_file in cache_source_dir.glob("*.json"):
                        template_file.unlink()
                        deleted_count += 1
            logging.info(f"Cleared {deleted_count} cached templates (all sources)")
        
        return deleted_count
    
    def get_cache_stats(self) -> Dict[str, int]:
        """
        Get cache statistics.
        
        Returns:
            Dict mapping source name to cached template count
        """
        stats = {}
        
        for source in self.sources:
            cache_source_dir = self.cache_dir / source
            if cache_source_dir.exists():
                count = len(list(cache_source_dir.glob("*.json")))
                stats[source] = count
            else:
                stats[source] = 0
        
        return stats
