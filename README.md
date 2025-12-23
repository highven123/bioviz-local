# 🧪 BioViz Local v2.0

BioViz Local 是一款**本地优先**、高性能的生物信息学可视化与 AI 协同分析工作站。它专为研究人员设计，能在保障数据隐私的前提下，通过 AI 智能 Agent 辅助完成从原始组学数据到出版级结论的全流程分析。

![BioViz Banner](assets/banner.png) *(注：由于隐私原因，请在本地运行查看完整 UI)*

## 🌟 v2.0 重大更新

在最新的 v2.0 版本中，我们实现了从“可视化工具”到“智能工作站”的跨越：

*   **🤖 Agentic AI Engine**: 内置基于 Motia 框架的 AI 智能体，具备自主工具调用能力，可自动执行富集分析、解读生物学意义并生成叙述性报告。
*   **🧬 多源通路融合 (Fusion Enrichment)**: 首次实现 KEGG、Reactome 与 GO 数据库的语义去重级融合分析，消除冗余，直击核心通路。
*   **🧩 单细胞上下文增强**: 新增单细胞数据（.h5ad）导入支持，支持细胞类型特异性的通路活性评分及配体-受体分析。
*   **📊 全自动化数据清洗**: 智能识别“宽矩阵”与“长表”，利用启发式算法自动映射基因与表达量列。
*   **📂 出版级 PPTX 导出**: 一键生成各元素可编辑的专业汇报 PPT，显著提升科研办公效率。

---

## ✨ 核心特性

### 1. 🔒 隐私安全与本地化
*   **数据不离库**：所有基因表达数据均在本地处理，彻底解决敏感数据（未发表论文数据、临床数据）上传云端的风险。
*   **本地 AI 驱动**：支持通过 Ollama 接入本地大模型，实现 100% 离线隐私分析。

### 2. 🧠 智能分析协同
*   **逻辑锁 (Logic Lock)**：AI 的所有“重操作”（如更新阈值、导出数据）均需用户确认，确保分析过程可控。
*   **语义叙述 (Narrative)**：不只是显示 P 值，AI 会结合最新文献背景，为您解读实验数据的生物学逻辑。

### 3. 🎨 极致的可视化体验
*   **深度通路渲染**：支持 0.5x 到 4x 的流畅缩放，动态映射 Log2FC 颜色。
*   **多维异构视图**：火山图、通路图、多样本趋势图在同一工作流下无缝联动。

---

## 🛠️ 技术架构

*   **前端**: React 19 + TypeScript + Vite + custom CSS (高端深蓝色调)
*   **容器**: Tauri v2 (Rust 驱动，轻量且安全)
*   **分析引擎 (Sidecar)**: Python 3.13 (集成 Pandas, SciPy, GSEAPY, Scanpy, Motia)
*   **通信**: 极速二进制与标准输入输出 (Stdio) 管道通信

---

## 🚀 快速开始

### 环境依赖
*   **Node.js**: v18+
*   **Rust**: [安装 Rust](https://rustup.rs/) (用于构建桌面端)
*   **Python**: 3.11+ (建议使用 venv)

### 安装与运行

1.  **克隆代码**
    ```bash
    git clone https://github.com/highven123/BioViz-Local.git
    cd BioViz-Local
    ```

2.  **安装 Node 依赖**
    ```bash
    npm install
    ```

3.  **构建 Python 运行环境**
    ```bash
    # 脚本会自动创建 venv 并安装所有生物科学库
    ./setup-ai-env.sh
    ```

4.  **启动开发环境**
    ```bash
    npm run tauri dev
    ```

---

## 📖 AI 功能配置

在项目根目录创建 `.env` 文件：

```ini
AI_PROVIDER=deepseek      # deepseek, openai, ollama
DEEPSEEK_API_KEY=sk-...   # 若使用 ollama 则无需填写
DEEPSEEK_MODEL=deepseek-v3
```

---

## 📄 开源协议

本项目采用 **MIT License**。

---
*BioViz Local - 让每一行生命数据都拥有深度洞察。*
