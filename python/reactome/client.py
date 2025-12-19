"""
Reactome API Client for BioViz v3.0
Fetches pathway diagrams and entities from Reactome Content Service.
"""

import logging
import json
import hashlib
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime, timedelta
import urllib.request
import urllib.error
import urllib.parse


class ReactomeClient:
    """Client for Reactome Content Service API."""
    
    BASE_URL = "https://reactome.org/ContentService"
    
    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or Path.home() / '.bioviz' / 'cache' / 'reactome'
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._headers = {
            'User-Agent': 'BioViz-Local/2.0',
            'Accept': 'application/json'
        }
    
    def _request(self, endpoint: str, params: Optional[Dict] = None) -> Dict:
        """Make HTTP request to Reactome API."""
        url = f"{self.BASE_URL}/{endpoint}"
        
        if params:
            # Properly URL encode all parameters
            query_string = urllib.parse.urlencode(params)
            url = f"{url}?{query_string}"
        
        logging.debug(f"Reactome API request: {url}")
        
        try:
            req = urllib.request.Request(url, headers=self._headers)
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            # Many pathways (especially top-level) have no diagram; treat 404 as expected
            if e.code == 404:
                logging.warning(f"Reactome API 404 for {endpoint}")
            else:
                logging.error(f"Reactome API error: {e.code} - {e.reason}")
            raise
        except Exception as e:
            logging.error(f"Reactome API request failed: {e}")
            raise
    
    def _get_cache_path(self, cache_key: str) -> Path:
        """Get cache file path for a key."""
        safe_key = hashlib.md5(cache_key.encode()).hexdigest()
        return self.cache_dir / f"{safe_key}.json"
    
    def _load_from_cache(self, cache_key: str, max_age_days: int = 7) -> Optional[Dict]:
        """Load data from cache if valid."""
        cache_path = self._get_cache_path(cache_key)
        
        if not cache_path.exists():
            return None
        
        try:
            with open(cache_path, 'r') as f:
                cached = json.load(f)
            
            cached_date = datetime.fromisoformat(cached.get('cached_at', '2000-01-01'))
            if datetime.now() - cached_date > timedelta(days=max_age_days):
                return None
            
            return cached.get('data')
        except Exception:
            return None
    
    def _save_to_cache(self, cache_key: str, data: Dict) -> None:
        """Save data to cache."""
        cache_path = self._get_cache_path(cache_key)
        
        try:
            with open(cache_path, 'w') as f:
                json.dump({
                    'cached_at': datetime.now().isoformat(),
                    'data': data
                }, f)
        except Exception as e:
            logging.warning(f"Failed to cache: {e}")
    
    def search_pathways(self, query: str, species: str = 'Homo sapiens', limit: int = 20) -> List[Dict]:
        """
        Search for pathways by name or keyword.
        
        Args:
            query: Search term
            species: Species name (e.g., 'Homo sapiens')
            limit: Maximum results
            
        Returns:
            List of pathway summaries
        """
        cache_key = f"search_{query}_{species}_{limit}"
        cached = self._load_from_cache(cache_key)
        if cached:
            return cached
        
        try:
            # Use search endpoint
            results = self._request(f"search/query/{urllib.parse.quote(query)}", {
                'species': species,
                'types': 'Pathway',
                'cluster': 'true'
            })
            
            pathways = []
            for entry in results.get('results', [])[:limit]:
                pathways.append({
                    'stId': entry.get('stId', ''),
                    'name': entry.get('name', ''),
                    'species': entry.get('species', ''),
                    'summation': entry.get('summation', [{}])[0].get('text', '')[:200] if entry.get('summation') else ''
                })
            
            self._save_to_cache(cache_key, pathways)
            return pathways
            
        except Exception as e:
            logging.error(f"Search failed: {e}")
            return []
    
    def get_pathway_info(self, pathway_id: str) -> Dict:
        """
        Get detailed pathway information.
        
        Args:
            pathway_id: Reactome stable ID (e.g., 'R-HSA-168256')
            
        Returns:
            Pathway details
        """
        cache_key = f"pathway_info_{pathway_id}"
        cached = self._load_from_cache(cache_key)
        if cached:
            return cached
        
        try:
            # Use /data/query endpoint which works for all entity types
            result = self._request(f"data/query/{pathway_id}")
            self._save_to_cache(cache_key, result)
            return result
        except Exception as e:
            logging.error(f"Failed to get pathway info: {e}")
            # Try alternative endpoint
            try:
                result = self._request(f"data/query/enhanced/{pathway_id}")
                self._save_to_cache(cache_key, result)
                return result
            except Exception:
                return {}
    
    def get_pathway_diagram(self, pathway_id: str) -> Tuple[Dict, Dict]:
        """
        Get pathway diagram data for visualization.
        
        Args:
            pathway_id: Reactome stable ID
            
        Returns:
            Tuple of (diagram_data, entity_mapping)
        """
        cache_key = f"diagram_{pathway_id}"
        cached = self._load_from_cache(cache_key)
        if cached:
            return cached.get('diagram', {}), cached.get('entities', {})
        
        try:
            # Get diagram layout
            diagram = self._request(f"diagram/layout/{pathway_id}")
            
            # Get entities (genes, proteins, etc.)
            entities = self._request(f"data/pathway/{pathway_id}/containedEvents")
            
            # Build entity mapping
            entity_map = {}
            for entity in entities:
                if entity.get('stId'):
                    entity_map[entity['stId']] = {
                        'name': entity.get('displayName', entity.get('name', '')),
                        'type': entity.get('className', 'Unknown')
                    }
            
            result = {'diagram': diagram, 'entities': entity_map}
            self._save_to_cache(cache_key, result)
            
            return diagram, entity_map
            
        except urllib.error.HTTPError as e:
            # 404 is common for high-level pathways; fallback to auto-layout upstream
            if e.code == 404:
                logging.warning(f"Pathway diagram not available (404) for {pathway_id}")
            else:
                logging.error(f"Failed to get pathway diagram: {e}")
            return {}, {}
        except Exception as e:
            logging.error(f"Failed to get pathway diagram: {e}")
            return {}, {}
    
    def get_pathway_participants(self, pathway_id: str) -> List[str]:
        """
        Get gene symbols participating in a pathway.
        Uses referenceEntities endpoint which is more reliable for high-level pathways.
        
        Args:
            pathway_id: Reactome stable ID
            
        Returns:
            List of gene symbols
        """
        cache_key = f"participants_ref_{pathway_id}"
        cached = self._load_from_cache(cache_key)
        if cached:
            return cached
        
        try:
            # referenceEntities endpoint gives us all unique participants including those in sub-pathways
            result = self._request(f"data/participants/{pathway_id}/referenceEntities")
            
            genes = set()
            for entity in result:
                # Most genes have a geneName field
                gene_names = entity.get('geneName', [])
                if isinstance(gene_names, list):
                    for g in gene_names:
                        if g: genes.add(g)
                elif gene_names:
                    genes.add(gene_names)
            
            gene_list = sorted(list(genes))
            self._save_to_cache(cache_key, gene_list)
            return gene_list
            
        except Exception as e:
            logging.error(f"Failed to get participants: {e}")
            # Fallback to the other endpoint if this one fails
            try:
                result = self._request(f"data/participants/{pathway_id}/participatingPhysicalEntities")
                genes = set()
                for entity in result:
                    ref_entities = entity.get('referenceEntity', {})
                    if ref_entities:
                        gene_names = ref_entities.get('geneName', [])
                        if isinstance(gene_names, list):
                            genes.update(gene_names)
                        elif gene_names:
                            genes.add(gene_names)
                return sorted(list(genes))
            except Exception:
                return []


def convert_reactome_to_template(
    diagram_data: Dict, 
    entity_map: Dict,
    pathway_info: Dict
) -> Dict:
    """
    Convert Reactome diagram data to BioViz PathwayTemplate format.
    
    Args:
        diagram_data: Reactome diagram layout
        entity_map: Entity ID to name mapping
        pathway_info: Pathway metadata
        
    Returns:
        PathwayTemplate compatible dict
    """
    template = {
        'id': pathway_info.get('stId', ''),
        'name': pathway_info.get('displayName', pathway_info.get('name', '')),
        'source': 'reactome',
        'species': pathway_info.get('species', {}).get('displayName', 'Human'),
        'nodes': [],
        'edges': [],
        'width': diagram_data.get('width', 1000),
        'height': diagram_data.get('height', 800)
    }
    
    # Process nodes
    for node in diagram_data.get('nodes', []):
        node_type = 'gene'  # Default
        schema_class = node.get('schemaClass', '')
        
        if 'Protein' in schema_class or 'EntityWithAccessionedSequence' in schema_class:
            node_type = 'gene'
        elif 'SimpleEntity' in schema_class or 'Chemical' in schema_class:
            node_type = 'compound'
        elif 'Complex' in schema_class:
            node_type = 'group'
        elif 'Reaction' in schema_class:
            node_type = 'reaction'
        
        position = node.get('position', {})
        
        template['nodes'].append({
            'id': str(node.get('id', '')),
            'name': node.get('displayName', node.get('name', '')),
            'type': node_type,
            'x': position.get('x', 0),
            'y': position.get('y', 0),
            'width': node.get('width', 50),
            'height': node.get('height', 30),
            'reactomeId': node.get('stId', '')
        })
    
    # Process edges
    for edge in diagram_data.get('edges', []):
        edge_type = 'arrow'  # Default
        reaction_type = edge.get('reactionType', '')
        
        if 'NEGATIVE' in reaction_type.upper():
            edge_type = 'inhibition'
        elif 'POSITIVE' in reaction_type.upper() or 'ACTIVATION' in reaction_type.upper():
            edge_type = 'activation'
        
        template['edges'].append({
            'id': str(edge.get('id', '')),
            'from': str(edge.get('from', '')),
            'to': str(edge.get('to', '')),
            'type': edge_type,
            'reactomeId': edge.get('stId', '')
        })
    
    return template
