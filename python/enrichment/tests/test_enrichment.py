"""
Unit tests for enrichment framework modules.

Run with: pytest python/enrichment/tests/
"""

import pytest
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from enrichment.id_mapper import GeneIdMapper, MappingReport
from enrichment.species import SpeciesDetector, detect_species
from enrichment.ora import run_ora, fisher_test
from enrichment.repro import ReproducibilityLogger


class TestGeneIdMapper:
    """Test ID mapping functionality"""
    
    def test_detect_ensembl_human(self):
        """Test detection of human Ensembl IDs"""
        mapper = GeneIdMapper()
        gene_ids = ["ENSG00000139618", "ENSG00000141510", "ENSG00000157764"]
        
        id_type, species = mapper.detect_id_type(gene_ids)
        
        assert id_type == 'ensembl_human'
        assert species == 'human'
    
    def test_detect_ensembl_mouse(self):
        """Test detection of mouse Ensembl IDs"""
        mapper = GeneIdMapper()
        gene_ids = ["ENSMUSG00000051951", "ENSMUSG00000034427"]
        
        id_type, species = mapper.detect_id_type(gene_ids)
        
        assert id_type == 'ensembl_mouse'
        assert species == 'mouse'
    
    def test_detect_symbols(self):
        """Test detection of gene symbols"""
        mapper = GeneIdMapper()
        gene_ids = ["TP53", "BRCA1", "EGFR", "MYC"]
        
        id_type, species = mapper.detect_id_type(gene_ids)
        
        assert id_type == 'symbol'
        assert species == 'human'
    
    def test_mapping_report(self):
        """Test mapping report generation"""
        mapper = GeneIdMapper()
        gene_ids = ["TP53", "BRCA1", "INVALID_GENE_XYZ", "TP53"]  # Include duplicate
        
        mapping, report = mapper.map_genes(gene_ids, species='human')
        
        assert isinstance(report, MappingReport)
        assert report.input_count == 4
        assert report.duplicated_count > 0
        assert report.species == 'human'


class TestSpeciesDetector:
    """Test species detection"""
    
    def test_detect_human_from_ensembl(self):
        """Test human detection from Ensembl IDs"""
        gene_ids = ["ENSG00000139618", "ENSG00000141510"]
        species_info = detect_species(gene_ids)
        
        assert species_info.species_key == 'human'
        assert species_info.taxon_id == 9606
        assert species_info.confidence > 0.9
    
    def test_detect_mouse_from_ensembl(self):
        """Test mouse detection from Ensembl IDs"""
        detector = SpeciesDetector()
        gene_ids = ["ENSMUSG00000051951", "ENSMUSG00000034427"]
        species_info = detector.detect_from_gene_ids(gene_ids)
        
        assert species_info.species_key == 'mouse'
        assert species_info.taxon_id == 10090
    
    def test_validate_species_input(self):
        """Test species validation"""
        detector = SpeciesDetector()
        
        # Valid inputs
        human = detector.validate_species('human')
        assert human.species_key == 'human'
        
        mouse = detector.validate_species('mmu')
        assert mouse.species_key == 'mouse'
        
        # Invalid input
        with pytest.raises(ValueError):
            detector.validate_species('invalid_species')


class TestORA:
    """Test Over-Representation Analysis"""
    
    def test_fisher_exact(self):
        """Test Fisher's exact test calculation"""
        # Simple contingency table
        odds_ratio, p_value = fisher_test(
            hit_in_pathway=10,
            hit_not_in_pathway=90,
            pathway_not_hit=20,
            background_not_hit=880
        )
        
        assert odds_ratio > 0
        assert 0 <= p_value <= 1
    
    def test_ora_simple(self):
        """Test basic ORA with mock data"""
        # Mock gene sets
        gene_sets = {
            'Pathway_A': ['GENE1', 'GENE2', 'GENE3', 'GENE4', 'GENE5'],
            'Pathway_B': ['GENE6', 'GENE7', 'GENE8', 'GENE9', 'GENE10'],
            'Pathway_C': ['GENE1', 'GENE6', 'GENE11', 'GENE12', 'GENE13']
        }
        
        # Input gene list (hits Pathway_A and Pathway_C)
        gene_list = ['GENE1', 'GENE2', 'GENE3', 'GENE6']
        
        results = run_ora(
            gene_list,
            gene_sets,
            p_cutoff=1.0,  # Include all for testing
            min_overlap=1
        )
        
        assert len(results) > 0
        assert all(r.p_value >= 0 and r.p_value <= 1 for r in results)
        assert all(r.fdr >= 0 for r in results)
    
    def test_ora_empty_input(self):
        """Test ORA with empty input"""
        gene_sets = {'Pathway_A': ['GENE1', 'GENE2']}
        gene_list = []
        
        results = run_ora(gene_list, gene_sets, min_overlap=1)
        
        assert len(results) == 0


class TestReproducibility:
    """Test reproducibility metadata logging"""
    
    def test_metadata_creation(self):
        """Test metadata object creation"""
        logger = ReproducibilityLogger()
        
        logger.set_method('ORA')
        logger.set_parameters(p_cutoff=0.05, fdr_method='BH')
        logger.set_input_summary(total_genes=100, mapped_genes=95)
        
        metadata = logger.get_metadata()
        
        assert metadata.method == 'ORA'
        assert metadata.parameters['p_cutoff'] == 0.05
        assert metadata.input_summary['total_genes'] == 100
        assert metadata.software_version is not None
    
    def test_gene_set_hash(self):
        """Test gene set hash calculation"""
        logger = ReproducibilityLogger()
        
        gene_sets = {
            'Set1': ['A', 'B', 'C'],
            'Set2': ['D', 'E', 'F']
        }
        
        logger.set_gene_set_info('test_source', 'v1.0', gene_sets)
        
        metadata = logger.get_metadata()
        assert len(metadata.gene_set_hash) == 16  # Short hash
        assert metadata.gene_set_source == 'test_source'


# Integration test
class TestPipeline:
    """Test complete pipeline integration"""
    
    @pytest.mark.integration
    def test_ora_pipeline_mock(self):
        """Test ORA pipeline with mock data (no network)"""
        from enrichment.pipeline import EnrichmentPipeline
        
        pipeline = EnrichmentPipeline()
        
        # Mock gene sets (bypassing download)
        mock_gene_sets = {
            'Immune_Response': ['IL6', 'TNF', 'IL1B', 'CCL2', 'CXCL8'],
            'Cell_Cycle': ['CDK4', 'CCND1', 'RB1', 'TP53', 'MYC']
        }
        
        # Mock source manager to return our mock data
        pipeline.source_manager.load_gene_sets = lambda *args, **kwargs: (
            mock_gene_sets,
            {'version': 'test', 'source': 'mock', 'stats': {'total_sets': 2}}
        )
        
        # Run ORA with gene list
        gene_list = ['IL6', 'TNF', 'IL1B']
        
        result = pipeline.run_ora(
            gene_list,
            gene_set_source='mock',
            species='human',
            p_cutoff=1.0
        )
        
        assert result['status'] == 'ok'
        assert result['method'] == 'ORA'
        assert 'results' in result
        assert 'metadata' in result
        assert 'mapping_report' in result


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
