"""
STRING DB API Client

Fetches protein-protein interaction (PPI) data from STRING DB.
Used for adding biological edges to auto-generated pathway diagrams.
"""

import logging
import requests
import json
import os
from typing import List, Dict, Optional, Set
from datetime import datetime

class STRINGClient:
    """
    Client for STRING DB API (https://string-db.org/).
    """
    
    API_URL = "https://string-db.org/api"
    
    def __init__(self, cache_dir: str = None):
        """
        Initialize STRING client.
        
        Args:
            cache_dir: Directory for caching API responses.
        """
        if cache_dir is None:
            self.cache_dir = os.path.expanduser("~/.bioviz/cache/string")
        else:
            self.cache_dir = cache_dir
            
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir, exist_ok=True)
            
        self.taxon_map = {
            'human': 9606,
            'homo sapiens': 9606,
            'mouse': 10090,
            'mus musculus': 10090,
            'rat': 10116,
            'rattus norvegicus': 10116,
            'yeast': 4932,
            'arabidopsis': 3702,
            'fly': 7227,
            'worm': 6239,
            'zebrafish': 7955
        }
        
    def get_interactions(self, 
                         genes: List[str], 
                         species: str = 'human', 
                         score_threshold: int = 400) -> List[Dict]:
        """
        Get interactions between a set of genes.
        
        Args:
            genes: List of gene symbols
            species: Species name or taxon ID
            score_threshold: Confidence score threshold (0-1000)
            
        Returns:
            List of interaction dictionaries
        """
        if not genes:
            return []
            
        taxon_id = self._get_taxon_id(species)
        
        # Check cache first
        cache_key = f"interactions_{taxon_id}_{hash(tuple(sorted(genes)))}_{score_threshold}"
        cached = self._load_from_cache(cache_key)
        if cached is not None:
            return cached
            
        try:
            logging.info(f"Fetching STRING interactions for {len(genes)} genes (species={species}, threshold={score_threshold})")
            
            # Using the 'network' endpoint to get interactions among the input genes
            method = "json/network"
            url = f"{self.API_URL}/{method}"
            
            params = {
                "identifiers": "\r".join(genes),
                "species": taxon_id,
                "required_score": score_threshold,
                "caller_identity": "BioViz"
            }
            
            response = requests.post(url, data=params, timeout=10)
            response.raise_for_status()
            
            interactions = response.json()
            
            # Clean up and normalize
            result = []
            seen_pairs = set()
            
            for inter in interactions:
                # STRING returns both directions sometimes, or duplicates
                # Normalize pair to avoid duplicates in the graph
                g1 = inter.get('preferredName_A')
                g2 = inter.get('preferredName_B')
                
                if not g1 or not g2:
                    continue
                    
                pair = tuple(sorted([g1, g2]))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                
                result.append({
                    'source': g1,
                    'target': g2,
                    'score': inter.get('score'),
                    'type': inter.get('escore', 'ppi') # Interaction type
                })
                
            self._save_to_cache(cache_key, result)
            return result
            
        except Exception as e:
            logging.error(f"Failed to fetch STRING interactions: {e}")
            return []
            
    def _get_taxon_id(self, species: str) -> int:
        """Map species name to taxon ID."""
        if isinstance(species, int) or (isinstance(species, str) and species.isdigit()):
            return int(species)
            
        low_species = species.lower()
        if low_species in self.taxon_map:
            return self.taxon_map[low_species]
            
        # Default to human if unknown
        logging.warning(f"Unknown species '{species}', defaulting to Human (9606)")
        return 9606
        
    def _load_from_cache(self, key: str) -> Optional[List]:
        """Load data from local JSON cache."""
        cache_file = os.path.join(self.cache_dir, f"{key}.json")
        if os.path.exists(cache_file):
            try:
                # Check if cache is older than 30 days
                mtime = os.path.getmtime(cache_file)
                if (datetime.now().timestamp() - mtime) > 86400 * 30:
                    return None
                    
                with open(cache_file, 'r') as f:
                    return json.load(f)
            except Exception:
                return None
        return None
        
    def _save_to_cache(self, key: str, data: List):
        """Save data to local JSON cache."""
        cache_file = os.path.join(self.cache_dir, f"{key}.json")
        try:
            with open(cache_file, 'w') as f:
                json.dump(data, f)
        except Exception as e:
            logging.warning(f"Failed to save cache: {e}")

if __name__ == "__main__":
    # Quick test
    logging.basicConfig(level=logging.INFO)
    client = STRINGClient()
    test_genes = ["TP53", "MDM2", "BRCA1", "ATM", "CHEK2"]
    interactions = client.get_interactions(test_genes)
    print(f"Found {len(interactions)} interactions")
    for inter in interactions:
        print(f"  {inter['source']} <-> {inter['target']} (score: {inter['score']})")
