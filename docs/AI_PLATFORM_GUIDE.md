# BioViz AI Platform - 用户指南

## 🎯 概述

BioViz AI Platform 提供两个核心 AI 功能：

1. **📝 机理叙事引擎** - 将富集结果转化为论文级生物学描述
2. **🧬 单细胞分析平台** - 通路评分、空间交互、轨迹动态

---

## 📝 机理叙事引擎 (Report Tab)

### 功能
- **语义去冗余**: 自动合并重叠通路，保留最具代表性的信号轴
- **文献关联**: 自动抓取 PubMed 证据验证基因-通路关系
- **动态叙事**: 生成结构化的机制描述

### 使用步骤
1. 完成富集分析 (Enrichment Tab)
2. 点击右侧面板的 **📝 Report** 按钮
3. 点击 **"🧬 Generate Narrative Report"**
4. 等待分析完成，查看生成的报告
5. 使用 **📋 Copy** 复制到剪贴板

### IPC 命令
```json
{
  "cmd": "agent_task",
  "intent": "analyze_narrative",
  "params": {
    "enrichment_results": [...]  // 可选，不提供则使用测试数据
  }
}
```

---

## 🧬 单细胞分析平台 (SC Tab)

### 前置要求
```bash
pip install scanpy anndata
```

### 功能
- **AnnData 加载**: 支持 .h5ad 文件格式
- **AUCell 通路评分**: 计算每个细胞的通路活性
- **空间 L-R 分析**: 检测配体-受体空间交互
- **伪时序轨迹**: 映射通路动态到发育轨迹

### 使用步骤
1. 点击右侧面板的 **🧬 SC** 按钮
2. 点击 **"📂 Select .h5ad File"** 选择数据文件
3. 设置 Cluster Column (如 `cell_type`, `leiden`)
4. 点击 **"🔬 Run Single-Cell Analysis"**
5. 查看结果：
   - 细胞/基因统计
   - L-R 交互列表
   - 动态通路列表

### 支持的数据格式
- **文件格式**: `.h5ad` (AnnData)
- **Cluster 注释**: `obs` 列 (如 `cell_type`, `leiden`, `louvain`)
- **空间坐标**: `obsm['spatial']` (可选)
- **伪时间**: `obs` 列包含 `pseudotime` 或 `dpt` (可选)

### IPC 命令
```json
{
  "cmd": "agent_task",
  "intent": "sc_contextual",
  "params": {
    "file_path": "/path/to/data.h5ad",
    "cluster_key": "cell_type",
    "pathways": {
      "Cell Cycle": ["CDK1", "CCNB1", "CDC20"],
      "Apoptosis": ["TP53", "BAX", "CASP3"]
    }
  }
}
```

---

## 🏗️ 技术架构

```
Frontend (React/TypeScript)
    ├── NarrativePanel.tsx     # Report 界面
    ├── SingleCellPanel.tsx    # SC 界面
    └── useBioEngine.ts        # IPC 通信
              ↓
Backend (Python Sidecar)
    ├── agent_runtime.py       # 工作流编排
    ├── workflow_registry.py   # Motia 步骤注册
    ├── narrative/             # 叙事引擎
    │   ├── deduplication.py   # Jaccard 去冗余
    │   └── literature_rag.py  # PubMed 连接
    └── singlecell/            # 单细胞分析
        ├── sc_loader.py       # AnnData 加载
        ├── pathway_scorer.py  # AUCell 算法
        ├── spatial_lr.py      # L-R 交互
        └── trajectory.py      # 轨迹映射
```

---

## ⚠️ 常见问题

### Q: 单细胞分析显示 "Single-cell modules not available"
**A**: 安装 scanpy 和 anndata:
```bash
pip install scanpy anndata
```

### Q: 文件选择器打不开
**A**: 确保应用有文件访问权限 (macOS 隐私设置)

### Q: 分析很慢
**A**: 大型数据集 (>50k cells) 可能需要几分钟。建议先在 Scanpy 中预处理数据。

---

## 📊 示例数据

推荐使用以下公开数据集测试：
- **PBMC 3k**: [10x Genomics](https://support.10xgenomics.com/single-cell-gene-expression/datasets)
- **Pancreas**: `scanpy.datasets.pbmc3k()`

---

*BioViz AI Platform v2.0 - Phase 3 Complete*
