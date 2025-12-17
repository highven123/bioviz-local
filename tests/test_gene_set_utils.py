"""
Unit tests for gene_set_utils module.
"""

import pytest
import tempfile
from pathlib import Path
from python.gene_set_utils import (
    load_gmt,
    save_gmt,
    validate_gene_sets,
    get_gene_set_stats,
    merge_gene_sets
)


class TestGMTLoading:
    """Test GMT file loading functionality."""
    
    def test_load_valid_gmt(self):
        """Test loading a valid GMT file."""
        # Create temporary GMT file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.gmt', delete=False) as f:
            f.write("PATHWAY1\tDescription1\tGENE1\tGENE2\tGENE3\n")
            f.write("PATHWAY2\tDescription2\tGENE4\tGENE5\n")
            temp_path = f.name
        
        try:
            gene_sets = load_gmt(temp_path)
            
            assert len(gene_sets) == 2
            assert "PATHWAY1" in gene_sets
            assert "PATHWAY2" in gene_sets
            assert len(gene_sets["PATHWAY1"]) == 3
            assert len(gene_sets["PATHWAY2"]) == 2
            assert "GENE1" in gene_sets["PATHWAY1"]
        finally:
            Path(temp_path).unlink()
    
    def test_load_with_duplicates(self):
        """Test GMT loading with duplicate gene set names."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.gmt', delete=False) as f:
            f.write("PATHWAY1\tDesc\tGENE1\tGENE2\n")
            f.write("PATHWAY1\tDesc\tGENE3\tGENE4\n")
            temp_path = f.name
        
        try:
            gene_sets = load_gmt(temp_path)
            
            # Should merge genes
            assert len(gene_sets) == 1
            assert len(gene_sets["PATHWAY1"]) == 4  # All 4 genes
        finally:
            Path(temp_path).unlink()
    
    def test_load_empty_file(self):
        """Test loading an empty GMT file."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.gmt', delete=False) as f:
            temp_path = f.name
        
        try:
            gene_sets = load_gmt(temp_path)
            assert len(gene_sets) == 0
        finally:
            Path(temp_path).unlink()
    
    def test_load_with_comments(self):
        """Test GMT loading with comment lines."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.gmt', delete=False) as f:
            f.write("# This is a comment\n")
            f.write("PATHWAY1\tDesc\tGENE1\tGENE2\n")
            temp_path = f.name
        
        try:
            gene_sets = load_gmt(temp_path)
            assert len(gene_sets) == 1
        finally:
            Path(temp_path).unlink()
    
    def test_load_nonexistent_file(self):
        """Test loading a file that doesn't exist."""
        with pytest.raises(FileNotFoundError):
            load_gmt("/nonexistent/path/file.gmt")


class TestGMTSaving:
    """Test GMT file saving functionality."""
    
    def test_save_gmt(self):
        """Test saving gene sets to GMT file."""
        gene_sets = {
            "PATHWAY1": ["GENE1", "GENE2", "GENE3"],
            "PATHWAY2": ["GENE4", "GENE5"]
        }
        
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "test.gmt"
            save_gmt(gene_sets, str(output_path))
            
            # Read back and verify
            loaded = load_gmt(str(output_path))
            assert len(loaded) == 2
            assert set(loaded["PATHWAY1"]) == {"GENE1", "GENE2", "GENE3"}
            assert set(loaded["PATHWAY2"]) == {"GENE4", "GENE5"}


class TestGeneSetValidation:
    """Test gene set validation."""
    
    def test_validate_size_filtering(self):
        """Test filtering by gene set size."""
        gene_sets = {
            "SMALL": ["G1", "G2"],  # Too small
            "VALID": ["G1", "G2", "G3", "G4", "G5", "G6"],
            "LARGE": ["G" + str(i) for i in range(600)]  # Too large
        }
        
        valid, warnings = validate_gene_sets(gene_sets, min_size=5, max_size=500)
        
        assert len(valid) == 1
        assert "VALID" in valid
        assert len(warnings) >= 2  # Warnings for SMALL and LARGE
    
    def test_validate_duplicates(self):
        """Test duplicate gene removal."""
        gene_sets = {
            "PATHWAY1": ["GENE1", "GENE2", "GENE1", "GENE3"]  # GENE1 appears twice
        }
        
        valid, warnings = validate_gene_sets(gene_sets, min_size=3, max_size=500)
        
        assert len(valid["PATHWAY1"]) == 3  # Duplicates removed
        assert any("duplicate" in w.lower() for w in warnings)


class TestGeneSetStats:
    """Test gene set statistics."""
    
    def test_stats_calculation(self):
        """Test statistics calculation."""
        gene_sets = {
            "PATHWAY1": ["G1", "G2", "G3"],
            "PATHWAY2": ["G3", "G4", "G5", "G6"]
        }
        
        stats = get_gene_set_stats(gene_sets)
        
        assert stats["total_sets"] == 2
        assert stats["total_genes"] == 7  # 3 + 4
        assert stats["unique_genes"] == 6  # G1-G6 (G3 appears twice)
        assert stats["min_size"] == 3
        assert stats["max_size"] == 4
        assert stats["avg_size"] == 3.5
    
    def test_stats_empty(self):
        """Test stats for empty gene sets."""
        stats = get_gene_set_stats({})
        
        assert stats["total_sets"] == 0
        assert stats["total_genes"] == 0


class TestGeneSetMerging:
    """Test gene set merging."""
    
    def test_merge_no_overlap(self):
        """Test merging gene sets with no overlapping names."""
        gs1 = {"PATH1": ["G1", "G2"]}
        gs2 = {"PATH2": ["G3", "G4"]}
        
        merged = merge_gene_sets([gs1, gs2])
        
        assert len(merged) == 2
        assert "PATH1" in merged
        assert "PATH2" in merged
    
    def test_merge_with_overlap(self):
        """Test merging gene sets with same pathway names."""
        gs1 = {"PATH1": ["G1", "G2"]}
        gs2 = {"PATH1": ["G3", "G4"]}
        
        merged = merge_gene_sets([gs1, gs2])
        
        assert len(merged) == 1
        assert len(merged["PATH1"]) == 4  # All genes merged
    
    def test_merge_deduplication(self):
        """Test that merging removes duplicate genes."""
        gs1 = {"PATH1": ["G1", "G2"]}
        gs2 = {"PATH1": ["G2", "G3"]}  # G2 is duplicate
        
        merged = merge_gene_sets([gs1, gs2])
        
        assert len(merged["PATH1"]) == 3  # G1, G2, G3 (no duplicate)
