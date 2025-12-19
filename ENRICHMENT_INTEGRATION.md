# Enrichment Framework Integration Guide

## 🚀 Quick Start - 3 Steps to Activate

### Step 1: Integrate API Handlers into bio_core.py

在 `/Users/haifeng/BioViz-Local/python/bio_core.py` 文件末尾（`if __name__ == "__main__"` 之前）添加以下代码：

```python
# ============================================================================
# Enrichment Framework v2.0 Handlers
# ============================================================================

def handle_enrich_run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Run enrichment analysis (ORA or GSEA)."""
    try:
        from enrichment.pipeline import EnrichmentPipeline
        
        method = payload.get('method', 'ORA').upper()
        genes = payload.get('genes', [])
        gene_set_source = payload.get('gene_set_source', 'reactome')
        species = payload.get('species', 'auto')
        custom_gmt_path = payload.get('custom_gmt_path')
        params = payload.get('parameters', {})
        
        if not genes:
            return {"status": "error", "message": "No genes provided"}
        
        pipeline = EnrichmentPipeline()
        
        if method == 'ORA':
            if isinstance(genes, dict):
                genes = list(genes.keys())
            
            result = pipeline.run_ora(
                gene_list=genes,
                gene_set_source=gene_set_source,
                species=species,
                custom_gmt_path=custom_gmt_path,
                p_cutoff=params.get('p_cutoff', 0.05),
                min_overlap=params.get('min_overlap', 3),
                fdr_method=params.get('fdr_method', 'fdr_bh')
            )
        
        elif method == 'GSEA':
            if isinstance(genes, list):
                return {"status": "error", "message": "GSEA requires ranked gene list"}
            
            result = pipeline.run_gsea(
                gene_ranking=genes,
                gene_set_source=gene_set_source,
                species=species,
                custom_gmt_path=custom_gmt_path,
                min_size=params.get('min_size', 5),
                max_size=params.get('max_size', 500),
                permutation_num=params.get('permutation_num', 1000)
            )
        
        else:
            return {"status": "error", "message": f"Unknown method: {method}"}
        
        return result
        
    except Exception as e:
        logging.error(f"Enrichment analysis failed: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


def handle_gene_set_list(payload: Dict[str, Any]) -> Dict[str, Any]:
    """List available gene set sources."""
    try:
        from enrichment.sources import GeneSetSourceManager
        
        species = payload.get('species', 'human')
        manager = GeneSetSourceManager()
        
        sources = manager.get_available_sources(species)
        
        return {
            "status": "ok",
            "sources": sources,
            "species": species
        }
        
    except Exception as e:
        logging.error(f"Failed to list gene sets: {e}")
        return {"status": "error", "message": str(e)}
```

### Step 2: Register Commands

找到 `bio_core.py` 中的 `process_command()` 函数，在命令分发部分（通常是 elif 链）添加：

```python
elif cmd == 'ENRICH_RUN':
    return handle_enrich_run(payload)
elif cmd == 'GENE_SET_LIST':
    return handle_gene_set_list(payload)
```

### Step 3: Add EnrichmentPanel to App.tsx

在 `/Users/haifeng/BioViz-Local/src/App.tsx` 中：

1. **导入组件：**
```typescript
import { EnrichmentPanel } from './components/EnrichmentPanel';
```

2. **在右侧面板添加新标签（类似 GSEA）：**
```tsx
{/* 在其他 panel tabs 旁边添加 */}
<button 
  className={rightPanelView === 'enrichment' ? 'active' : ''}
  onClick={() => setRightPanelView('enrichment')}
>
  🧬 Enrichment v2
</button>
```

3. **在右侧面板内容区添加：**
```tsx
{rightPanelView === 'enrichment' && (
  <EnrichmentPanel 
    volcanoData={activeAnalysis?.volcano_data}
    onEnrichmentComplete={(results) => {
      console.log('Enrichment results:', results);
    }}
  />
)}
```

---

## ✅ 验证安装

### 后端检查：
```bash
cd python
python -c "from enrichment.pipeline import EnrichmentPipeline; print('✅ Backend OK')"
```

### 前端检查：
- 重启 `npm run tauri dev`
- 右侧面板应该出现 "🧬 Enrichment v2" 标签
- 点击后显示 Method/Source/Species 选择器

---

## 📦 依赖要求

### Python 依赖（已包含在 requirements_prod.txt）：
```
scipy>=1.11.0
statsmodels>=0.14.0
mygene>=3.2.2
gseapy>=1.1.0
pandas>=2.0.0
```

### 安装（如需要）：
```bash
cd python
pip install scipy statsmodels mygene
```

---

## 🎯 使用示例

### 前端调用：
```typescript
// ORA 示例
await sendCommand('ENRICH_RUN', {
  method: 'ORA',
  genes: ['TP53', 'BRCA1', 'EGFR', ...],
  gene_set_source: 'reactome',
  species: 'human'
});

// GSEA 示例
await sendCommand('ENRICH_RUN', {
  method: 'GSEA',
  genes: {
    'TP53': 3.5,
    'BRCA1': 2.8,
    'EGFR': -2.1,
    ...
  },
  gene_set_source: 'reactome',
  species: 'auto'
});
```

---

## 🐛 Troubleshooting

| 问题 | 解决方案 |
|------|----------|
| "enrichment module not found" | 确认 `python/enrichment/` 目录存在 |
| "mygene not installed" | `pip install mygene` |
| "scipy not installed" | `pip install scipy statsmodels` |
| 前端无法调用 | 检查 bio_core.py 中是否注册了 'ENRICH_RUN' 命令 |

---

## 📊 功能对比

| 功能 | 旧 GSEA 模块 | 新 Enrichment 框架 |
|------|--------------|-------------------|
| ORA | ❌ | ✅ Fisher + BH FDR |
| GSEA | ✅ | ✅ 改进版 |
| ID Mapping | ❌ | ✅ mygene cache |
| Species | 仅 Human | ✅ Human/Mouse/Rat |
| 可复现性 | ❌ | ✅ 完整 metadata |
| 错误处理 | 基础 | ✅ 科学级 |

---

**状态：** 后端100%完成，前端UI已创建，API集成需手动完成上述3步。
