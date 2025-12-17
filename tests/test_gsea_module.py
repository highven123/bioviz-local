"""
Unit tests for gsea_module.
"""

import pytest
from python.gsea_module import (
    validate_gene_list,
    validate_gene_ranking,
    check_gene_set_overlap,
    export_enrichment_csv,
    export_gsea_csv
)
import tempfile
from pathlib import Path


class TestGeneListValidation:
    """Test gene list validation."""
    
    def test_valid_gene_list(self):
        """Test validation of a valid gene list."""
        genes = ["GENE1", "GENE2", "GENE3"]
        valid, warnings = validate_gene_list(genes)
        
        assert len(valid) == 3
        assert valid == genes
        assert len(warnings) == 0
    
    def test_empty_gene_list(self):
        """Test empty gene list."""
        valid, warnings = validate_gene_list([])
        
        assert len(valid) == 0
        assert len(warnings) > 0
        assert any("empty" in w.lower() for w in warnings)
    
    def test_duplicate_genes(self):
        """Test gene list with duplicates."""
        genes = ["GENE1", "GENE2", "GENE1", "GENE3"]
        valid, warnings = validate_gene_list(genes)
        
        assert len(valid) == 3  # Duplicates removed
        assert "GENE1" in valid
        assert len(warnings) > 0
        assert any("duplicate" in w.lower() for w in warnings)
    
    def test_empty_strings(self):
        """Test gene list with empty strings."""
        genes = ["GENE1", "", "GENE2", "   ", "GENE3"]
        valid, warnings = validate_gene_list(genes)
        
        assert len(valid) == 3
        assert "" not in valid
    
    def test_whitespace_trimming(self):
        """Test that whitespace is trimmed."""
        genes = ["  GENE1  ", "GENE2\t", " GENE3"]
        valid, warnings = validate_gene_list(genes)
        
        assert valid == ["GENE1", "GENE2", "GENE3"]


class TestGeneRankingValidation:
    """Test gene ranking validation."""
    
    def test_valid_ranking(self):
        """Test validation of valid gene ranking."""
        ranking = {"GENE1": 2.5, "GENE2": -1.3, "GENE3": 0.0}
        valid, warnings = validate_gene_ranking(ranking)
        
        assert len(valid) == 3
        assert valid["GENE1"] == 2.5
        assert len(warnings) == 0
    
    def test_empty_ranking(self):
        """Test empty ranking."""
        valid, warnings = validate_gene_ranking({})
        
        assert len(valid) == 0
        assert len(warnings) > 0
    
    def test_invalid_scores(self):
        """Test ranking with invalid scores."""
        ranking = {"GENE1": 2.5, "GENE2": "invalid", "GENE3": None}
        valid, warnings = validate_gene_ranking(ranking)
        
        assert len(valid) == 1  # Only GENE1 is valid
        assert "GENE1" in valid
        assert len(warnings) > 0
    
    def test_extreme_scores(self):
        """Test warning for extreme scores."""
        ranking = {"GENE1": 1e15}  # Extremely large
        valid, warnings = validate_gene_ranking(ranking)
        
        # Should still be in valid but with warning
        assert len(warnings) > 0
        assert any("extreme" in w.lower() for w in warnings)
    
    def test_empty_gene_names(self):
        """Test ranking with empty gene names."""
        ranking = {"GENE1": 2.5, "": 1.0, "   ": 0.5}
        valid, warnings = validate_gene_ranking(ranking)
        
        assert len(valid) == 1
        assert "GENE1" in valid


class TestCSVExport:
    """Test CSV export functionality."""
    
    def test_export_enrichment_csv(self):
        """Test ORA enrichment CSV export."""
        results = {
            "enriched_terms": [
                {
                    "term": "Pathway1",
                    "overlap": "5/100",
                    "p_value": 0.001,
                    "adjusted_p_value": 0.01,
                    "odds_ratio": 2.5,
                    "combined_score": 15.3,
                    "genes": ["GENE1", "GENE2", "GENE3"]
                }
            ]
        }
        
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "enrichment.csv"
            export_enrichment_csv(results, str(output_path))
            
            # Verify file was created
            assert output_path.exists()
            
            # Read and check content
            with open(output_path, 'r') as f:
                lines = f.readlines()
                assert len(lines) == 2  # Header + 1 data row
                assert "Term" in lines[0]
                assert "Pathway1" in lines[1]
    
    def test_export_gsea_csv(self):
        """Test GSEA CSV export."""
        results = {
            "up_regulated": [
                {
                    "term": "Pathway1",
                    "es": 0.5,
                    "nes": 2.1,
                    "p_value": 0.001,
                    "fdr": 0.05,
                    "fwer": 0.02,
                    "gene_size": 50,
                    "lead_genes": ["GENE1", "GENE2"]
                }
            ],
            "down_regulated": [
                {
                    "term": "Pathway2",
                    "es": -0.4,
                    "nes": -1.8,
                    "p_value": 0.01,
                    "fdr": 0.1,
                    "fwer": 0.05,
                    "gene_size": 30,
                    "lead_genes": ["GENE3"]
                }
            ]
        }
        
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "gsea.csv"
            export_gsea_csv(results, str(output_path))
            
            assert output_path.exists()
            
            with open(output_path, 'r') as f:
                lines = f.readlines()
                assert len(lines) == 3  # Header + 2 data rows
                assert "NES" in lines[0]


class TestEdgeCases:
    """Test edge cases and error handling."""
    
    def test_single_gene(self):
        """Test with single gene."""
        genes = ["GENE1"]
        valid, warnings = validate_gene_list(genes)
        
        assert len(valid) == 1
        assert valid[0] == "GENE1"
    
    def test_ranking_ties(self):
        """Test ranking with tied scores."""
        ranking = {"GENE1": 1.0, "GENE2": 1.0, "GENE3": 2.0}
        valid, warnings = validate_gene_ranking(ranking)
        
        # Should accept all
        assert len(valid) == 3
    
    def test_zero_scores(self):
        """Test ranking with zero scores."""
        ranking = {"GENE1": 0.0, "GENE2": 0.0}
        valid, warnings = validate_gene_ranking(ranking)
        
        assert len(valid) == 2
        assert all(v == 0.0 for v in valid.values())


# Note: Tests that require gseapy to be installed
# These should be run conditionally or mocked

class TestWithGseapy:
    """Tests that require gseapy installation."""
    
    @pytest.mark.skipif(True, reason="Requires gseapy and network access")
    def test_run_enrichr_integration(self):
        """Integration test for run_enrichr (requires gseapy)."""
        # This would test actual gseapy calls
        pass
    
    @pytest.mark.skipif(True, reason="Requires gseapy")
    def test_run_gsea_prerank_integration(self):
        """Integration test for GSEA prerank (requires gseapy)."""
        pass
