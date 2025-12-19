#!/usr/bin/env python3
"""
Batch Download Reactome Pathway Templates

This script downloads the top Reactome pathways and saves them as
pre-bundled JSON templates for offline use.

Usage:
    python scripts/download_reactome_templates.py

Output:
    assets/templates/reactome/*.json
"""

import sys
import json
import logging
from pathlib import Path
from typing import List, Dict
import time

# Add parent directory to path to import modules
sys.path.insert(0, str(Path(__file__).parent.parent / 'python'))

from reactome.client import ReactomeClient, convert_reactome_to_template

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)

# Top 50 Reactome pathways (curated list based on usage frequency)
# These are pathways commonly enriched in genomics studies
TOP_REACTOME_PATHWAYS = [
    # Immune System (10)
    'R-HSA-168256',   # Immune System
    'R-HSA-1280215',  # Cytokine Signaling in Immune System
    'R-HSA-449147',   # Signaling by Interleukins
    'R-HSA-168249',   # Innate Immune System
    'R-HSA-6783783',  # Interleukin-10 signaling
    'R-HSA-6785807',  # Interleukin-4 and Interleukin-13 signaling
    'R-HSA-1280218',  # Adaptive Immune System
    'R-HSA-202403',   # TCR signaling
    'R-HSA-202424',   # Downstream TCR signaling
    'R-HSA-198933',   # Immunoregulatory interactions between a Lymphoid and a non-Lymphoid cell
    
    # Signal Transduction (10)
    'R-HSA-162582',   # Signal Transduction
    'R-HSA-194315',   # Signaling by Rho GTPases
    'R-HSA-5663202',  # Diseases of signal transduction by growth factor receptors and second messengers
    'R-HSA-1257604',  # PIP3 activates AKT signaling
    'R-HSA-109582',   # Hemostasis
    'R-HSA-372790',   # Signaling by GPCR
    'R-HSA-388396',   # GPCR downstream signalling
    'R-HSA-1433557',  # Signaling by SCF-KIT
    'R-HSA-5673001',  # RAF/MAP kinase cascade
    'R-HSA-2586552',  # Signaling by Leptin
    
    # Cell Cycle & DNA Repair (8)
    'R-HSA-1640170',  # Cell Cycle
    'R-HSA-69278',    # Cell Cycle, Mitotic
    'R-HSA-453279',   # Mitotic G1 phase and G1/S transition
    'R-HSA-69620',    # Cell Cycle Checkpoints
    'R-HSA-73894',    # DNA Repair
    'R-HSA-5693532',  # DNA Double-Strand Break Repair
    'R-HSA-69306',    # DNA Replication
    'R-HSA-68962',    # Activation of the pre-replicative complex
    
    # Metabolism (8)
    'R-HSA-1430728',  # Metabolism
    'R-HSA-70326',    # Glucose metabolism
    'R-HSA-163200',   # Respiratory electron transport, ATP synthesis
    'R-HSA-71291',    # Metabolism of amino acids and derivatives
    'R-HSA-556833',   # Metabolism of lipids
    'R-HSA-8978934',  # Metabolism of cofactors
    'R-HSA-196071',   # Metabolism of nucleotides
    'R-HSA-1660661',  # Glycolysis
    
    # Developmental Biology (6)
    'R-HSA-1266738',  # Developmental Biology
    'R-HSA-1266695',  # Interleukin-7 signaling
    'R-HSA-8848021',  # Signaling by PTK6
    'R-HSA-5663205',  # Infectious disease
    'R-HSA-9006934',  # Signaling by Receptor Tyrosine Kinases
    'R-HSA-186797',   # Signaling by PDGF
    
    # Cellular Responses (8)
    'R-HSA-2262752',  # Cellular responses to stress
    'R-HSA-2559583',  # Cellular Senescence
    'R-HSA-3700989',  # Transcriptional Regulation by TP53
    'R-HSA-212436',   # Generic Transcription Pathway
    'R-HSA-73857',    # RNA Polymerase II Transcription
    'R-HSA-1643685',  # Disease
    'R-HSA-5357801',  # Programmed Cell Death
    'R-HSA-109581',   # Apoptosis
]


def download_pathway_template(client: ReactomeClient, pathway_id: str, output_dir: Path) -> bool:
    """
    Download a single pathway and save as JSON template.
    
    Args:
        client: ReactomeClient instance
        pathway_id: Reactome pathway ID
        output_dir: Output directory for JSON files
    
    Returns:
        True if successful
    """
    try:
        logging.info(f"Downloading {pathway_id}...")
        
        # Get pathway info
        pathway_info = client.get_pathway_info(pathway_id)
        
        # API may return list
        if isinstance(pathway_info, list):
            pathway_info = pathway_info[0] if pathway_info else {}
        
        if not pathway_info:
            logging.warning(f"  Pathway info not found for {pathway_id}")
            return False
        
        pathway_name = pathway_info.get('displayName', '') or pathway_info.get('name', pathway_id)
        logging.info(f"  Name: {pathway_name}")
        
        # Get diagram data
        diagram_data, entity_map = client.get_pathway_diagram(pathway_id)
        
        # Get participant genes
        gene_list = client.get_pathway_participants(pathway_id)
        
        # Build template
        species_info = pathway_info.get('species', {})
        if isinstance(species_info, list):
            species_info = species_info[0] if species_info else {}
        species_name = species_info.get('displayName', 'Human') if isinstance(species_info, dict) else 'Human'
        
        template = {
            'id': pathway_id,
            'name': pathway_name,
            'source': 'reactome',
            'species': species_name,
            'nodes': [],
            'edges': [],
            'width': 1000,
            'height': 800,
            'genes': gene_list if isinstance(gene_list, list) else []
        }
        
        # Add diagram if available
        if diagram_data and isinstance(diagram_data, dict) and diagram_data.get('nodes'):
            template = convert_reactome_to_template(diagram_data, entity_map, pathway_info)
            template['genes'] = gene_list if isinstance(gene_list, list) else []
            logging.info(f"  Nodes: {len(template['nodes'])}, Genes: {len(template['genes'])}")
        else:
            logging.warning(f"  No diagram available, using basic template")
        
        # Save to file
        output_file = output_dir / f"{pathway_id}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=2, ensure_ascii=False)
        
        logging.info(f"  ✓ Saved to {output_file.name}")
        return True
    
    except Exception as e:
        logging.error(f"  ✗ Failed to download {pathway_id}: {e}")
        return False


def main():
    """Main download process."""
    # Setup paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    output_dir = project_root / 'assets' / 'templates' / 'reactome'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    logging.info(f"Output directory: {output_dir}")
    logging.info(f"Total pathways to download: {len(TOP_REACTOME_PATHWAYS)}")
    
    # Initialize client
    client = ReactomeClient()
    
    # Download each pathway
    success_count = 0
    failed = []
    
    for i, pathway_id in enumerate(TOP_REACTOME_PATHWAYS, 1):
        logging.info(f"\n[{i}/{len(TOP_REACTOME_PATHWAYS)}] Processing {pathway_id}")
        
        if download_pathway_template(client, pathway_id, output_dir):
            success_count += 1
        else:
            failed.append(pathway_id)
        
        # Rate limiting - be nice to Reactome API
        if i < len(TOP_REACTOME_PATHWAYS):
            time.sleep(1)  # 1 second delay between requests
    
    # Summary
    logging.info("\n" + "="*60)
    logging.info(f"Download complete!")
    logging.info(f"  Success: {success_count}/{len(TOP_REACTOME_PATHWAYS)}")
    logging.info(f"  Failed: {len(failed)}")
    
    if failed:
        logging.warning(f"  Failed IDs: {', '.join(failed)}")
    
    logging.info(f"  Templates saved to: {output_dir}")
    logging.info("="*60)


if __name__ == '__main__':
    main()
