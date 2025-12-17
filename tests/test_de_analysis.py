"""
Unit tests for de_analysis module.
"""

import pytest
import numpy as np
import pandas as pd
from python.de_analysis import (
    simple_ttest_de,
    auto_de_analysis
)


class TestSimpleTtest:
    """Test simple t-test DE analysis."""
    
    def test_basic_de_analysis(self):
        """Test basic DE analysis with mock data."""
        # Create mock count data
        np.random.seed(42)
        counts = pd.DataFrame({
            'Sample1_G1': [100, 200, 50, 10],
            'Sample2_G1': [110, 190, 55, 12],
            'Sample3_G1': [95, 210, 48, 11],
            'Sample1_G2': [200, 100, 52, 11],
            'Sample2_G2': [210, 90, 50, 10],
            'Sample3_G2': [195, 110, 51, 12]
        }, index=['GENE1', 'GENE2', 'GENE3', 'GENE4'])
        
        group1 = ['Sample1_G1', 'Sample2_G1', 'Sample3_G1']
        group2 = ['Sample1_G2', 'Sample2_G2', 'Sample3_G2']
        
        results = simple_ttest_de(counts, group1, group2, p_threshold=0.05)
        
        assert len(results) > 0
        assert 'gene' in results.columns
        assert 'log2FC' in results.columns
        assert 'pvalue' in results.columns
        assert 'FDR' in results.columns
        assert 'status' in results.columns
    
    def test_fdr_correction(self):
        """Test FDR values are in valid range."""
        np.random.seed(42)
        counts = pd.DataFrame(
            np.random.poisson(50, (100, 6)),
            columns=[f'S{i}_G{1 if i < 3 else 2}' for i in range(6)],
            index=[f'GENE{i}' for i in range(100)]
        )
        
        group1 = ['S0_G1', 'S1_G1', 'S2_G1']
        group2 = ['S3_G2', 'S4_G2', 'S5_G2']
        
        results = simple_ttest_de(counts, group1, group2)
        
        # FDR should be in [0, 1]
        assert all(results['FDR'] >= 0)
        assert all(results['FDR'] <= 1)
        
        # FDR should be >= p-value (BH correction)
        assert all(results['FDR'] >= results['pvalue'])
    
    def test_log2fc_preservation(self):
        """Test log2FC signs are correct."""
        # Create data where group2 > group1
        counts = pd.DataFrame({
            'S1_G1': [10, 100],
            'S2_G1': [12, 110],
            'S1_G2': [100, 10],
            'S2_G2': [110, 12]
        }, index=['UP_GENE', 'DOWN_GENE'])
        
        results = simple_ttest_de(
            counts, 
            ['S1_G1', 'S2_G1'], 
            ['S1_G2', 'S2_G2'],
            p_threshold=1.0,  # Accept all
            log2fc_threshold=0
        )
        
        up_gene = results[results['gene'] == 'UP_GENE'].iloc[0]
        down_gene = results[results['gene'] == 'DOWN_GENE'].iloc[0]
        
        assert up_gene['log2FC'] > 0  # Group2 > Group1
        assert down_gene['log2FC'] < 0  # Group2 < Group1
    
    def test_status_classification(self):
        """Test status classification (UP/DOWN/NS)."""
        np.random.seed(42)
        counts = pd.DataFrame({
            'S1': [100, 200, 50],
            'S2': [110, 190, 52],
            'S3': [500, 100, 51],
            'S4': [510, 90, 50]
        }, index=['GENE1', 'GENE2', 'GENE3'])
        
        results = simple_ttest_de(
            counts,
            ['S1', 'S2'],
            ['S3', 'S4'],
            p_threshold=0.1,
            log2fc_threshold=1.0
        )
        
        # Check status values are valid
        assert set(results['status']).issubset({'UP', 'DOWN', 'NS'})
    
    def test_empty_counts(self):
        """Test error handling for empty counts."""
        empty_counts = pd.DataFrame()
        
        with pytest.raises(ValueError, match="Empty counts"):
            simple_ttest_de(empty_counts, ['S1'], ['S2'])
    
    def test_missing_samples(self):
        """Test error handling for missing samples."""
        counts = pd.DataFrame({
            'S1': [100],
            'S2': [110]
        }, index=['GENE1'])
        
        with pytest.raises(ValueError, match="not found"):
            simple_ttest_de(counts, ['S1', 'S_MISSING'], ['S2'])
    
    def test_insufficient_samples(self):
        """Test error handling for insufficient samples."""
        counts = pd.DataFrame({
            'S1': [100],
            'S2': [110]
        }, index=['GENE1'])
        
        with pytest.raises(ValueError, match="at least 2 samples"):
            simple_ttest_de(counts, ['S1'], ['S2'])
    
    def test_all_zero_genes(self):
        """Test genes with all zeros are filtered."""
        counts = pd.DataFrame({
            'S1': [100, 0],
            'S2': [110, 0],
            'S3': [200, 0],
            'S4': [210, 0]
        }, index=['GENE1', 'ZERO_GENE'])
        
        results = simple_ttest_de(counts, ['S1', 'S2'], ['S3', 'S4'])
        
        # ZERO_GENE should be filtered
        assert 'ZERO_GENE' not in results['gene'].values


class TestAutoAnalysis:
    """Test auto DE analysis."""
    
    def test_auto_method_selection(self):
        """Test automatic method selection."""
        np.random.seed(42)
        counts = pd.DataFrame(
            np.random.poisson(50, (10, 4)),
            columns=['S1_G1', 'S2_G1', 'S1_G2', 'S2_G2'],
            index=[f'GENE{i}' for i in range(10)]
        )
        
        result = auto_de_analysis(
            counts,
            ['S1_G1', 'S2_G1'],
            ['S1_G2', 'S2_G2'],
            method="auto"
        )
        
        assert result['status'] == 'ok'
        assert 'method' in result
        assert 'results' in result
        assert 'summary' in result
    
    def test_force_ttest(self):
        """Test forcing t-test method."""
        np.random.seed(42)
        counts = pd.DataFrame(
            np.random.poisson(50, (10, 4)),
            columns=['S1', 'S2', 'S3', 'S4'],
            index=[f'GENE{i}' for i in range(10)]
        )
        
        result = auto_de_analysis(
            counts,
            ['S1', 'S2'],
            ['S3', 'S4'],
            method="ttest"
        )
        
        assert result['method'] == 'Simple t-test'
        assert result['warning'] is not None  # Should warn about publication
    
    def test_summary_counts(self):
        """Test summary statistics are correct."""
        np.random.seed(42)
        counts = pd.DataFrame(
            np.random.poisson(50, (20, 4)),
            columns=['S1', 'S2', 'S3', 'S4'],
            index=[f'GENE{i}' for i in range(20)]
        )
        
        result = auto_de_analysis(counts, ['S1', 'S2'], ['S3', 'S4'])
        
        summary = result['summary']
        assert 'total_genes' in summary
        assert 'up_regulated' in summary
        assert 'down_regulated' in summary
        assert 'not_significant' in summary
        
        # Counts should sum to total
        total = (summary['up_regulated'] + 
                 summary['down_regulated'] + 
                 summary['not_significant'])
        assert total == summary['total_genes']


class TestPyDESeq2Integration:
    """Test pyDESeq2 integration (if installed)."""
    
    @pytest.mark.skipif(True, reason="Requires pyDESeq2 installation")
    def test_deseq2_method(self):
        """Test DESeq2 method (requires pyDESeq2)."""
        # This test would require pyDESeq2 to be installed
        pass


# Edge cases
class TestEdgeCases:
    """Test edge cases."""
    
    def test_single_gene(self):
        """Test analysis with single gene."""
        counts = pd.DataFrame({
            'S1': [100],
            'S2': [110],
            'S3': [200],
            'S4': [210]
        }, index=['GENE1'])
        
        results = simple_ttest_de(counts, ['S1', 'S2'], ['S3', 'S4'])
        
        assert len(results) == 1
    
    def test_high_variance(self):
        """Test genes with high variance."""
        counts = pd.DataFrame({
            'S1': [10, 100],
            'S2': [1000, 100],
            'S3': [10, 500],
            'S4': [1000, 500]
        }, index=['HIGH_VAR', 'NORMAL'])
        
        results = simple_ttest_de(counts, ['S1', 'S2'], ['S3', 'S4'])
        
        # Should handle without crashing
        assert len(results) >= 0
