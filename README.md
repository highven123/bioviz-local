# BioViz Local (Biological Pathway Visualization & Analysis)

BioViz Local is a **local-first**, privacy-focused biological pathway analysis and visualization tool. It combines modern web technologies (React + Tauri) with a powerful Python analysis engine, assisted by local AI agents, to provide an intuitive and in-depth gene/protein omics data analysis experience.

![BioViz Screenshot](https://raw.githubusercontent.com/highven123/BioViz-Local/main/screenshots/demo.png)

## ✨ Core Features

*   **🔒 Local-First & Privacy Protection**: All data processing is done on your local computer, with no need to upload sensitive gene expression data to cloud servers.
*   **🧬 Interactive KEGG Pathway Analysis**: 
    - Advanced rendering of KEGG pathways with zoom limits (0.5x-4x)
    - Direct mapping of gene/protein log2 fold change expression data onto pathway diagrams
    - Automatic node color matching based on expression levels
*   **🤖 Context-Aware AI Assistant**:
    - **Compact floating panel** with 2-column skill grid layout (English UI)
    - Draggable robot icon positioned on the right side
    - **Logic Lock security architecture**: AI operations are strictly limited and only execute with user authorization
    - **Deep analysis**: AI understands current pathway and data context, providing real biological insights
    - **Tool invocation**: Automated data queries, pathway switching, and statistical analysis
*   **📊 Multi-Dimensional Data Display**: Integrated Volcano Plot, statistics summary panels, and detailed data tables
*   **📝 Report Export**: Export high-quality SVG/PNG images and editable PPTX presentations for academic publication
*   **🎨 Modern UI/UX**:
    - Horizontal floating toolbar for view switching (Stats/Pathway/AI Chat)
    - Draggable control panel positioned in top-right of pathway area
    - All panels open by default for immediate access

## 🛠️ Tech Stack

*   **Frontend**: React, TypeScript, Vite, CSS (custom design)
*   **Backend (App)**: Tauri (Rust)
*   **Analysis Engine**: Python 3.11+, Pandas, NetworkX, BioPython
*   **Visualization**: ECharts with custom pathway rendering
*   **AI Engine**: Integrated DeepSeek, OpenAI, or local Ollama models

## 🚀 Quick Start

### Prerequisites

Ensure your system has:
*   [Node.js](https://nodejs.org/) (v16+)
*   [Rust & Cargo](https://rustup.rs/) (for building desktop app)
*   [Python 3.11+](https://www.python.org/) (for analysis engine)

### Installation Steps

1.  **Clone repository**
    ```bash
    git clone https://github.com/highven123/BioViz-Local.git
    cd BioViz-Local
    ```

2.  **Install frontend dependencies**
    ```bash
    npm install
    ```

3.  **Set up Python environment**
    Recommended using virtual environment:
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # Windows: venv\Scripts\activate
    pip install -r python/requirements.txt
    ```

### Run Development Version

```bash
npm run tauri dev
```
This command will start both the frontend dev server and Tauri window.

## 🤖 AI Configuration

BioViz Local supports multiple AI models. Create a `.env` file in the project root or use the provided `setup-ai-env.sh` script for configuration.

Reference template (`.env.example`):
```ini
# Choose AI provider: deepseek, openai, bailian, or ollama
AI_PROVIDER=deepseek

# API Key (not needed for local Ollama)
DEEPSEEK_API_KEY=your_api_key_here

# Model name
DEEPSEEK_MODEL=deepseek-v3.2-exp
```

## 📖 User Guide

1.  **Import Data**: Click "Import Data" on the main page, upload CSV/Excel file containing gene/protein expression data.
2.  **Map Columns**: System will automatically attempt to identify Gene Name, Log2FC, and P-value columns - you can manually correct.
3.  **Select Pathway**: Choose interested KEGG pathway from the left panel (e.g., "Glycolysis / Gluconeogenesis").
4.  **Pathway Visualization**:
    - Zoom limits: 0.5x (minimum) to 4x (maximum)
    - Use floating toolbar to reset view, export PNG/SVG/PPTX, or save data
5.  **AI Interaction**: Click the 🤖 robot icon on the right, try asking:
    - "Analyze current pathway expression patterns"
    - "Why is PFKM downregulated?"
    - "Run GSEA analysis"
    - "Compare upregulated vs downregulated genes"

## 🎨 UI Features

*   **Floating View Toolbar**: Draggable horizontal bar with 3 buttons (📊 Stats, 🗺️ Pathway, 🤖 AI Chat)
    - Default position: Top-right of pathway area
    - Fully draggable across entire window
*   **AI Assistant Panel**: 
    - Minimized: Single 🤖 robot icon
    - Expanded: Compact 200px panel with 2-column skill grid
    - 6 quick skills: GSEA, Enrichment, Report, Compare, Trends, Research
    - Draggable anywhere on screen with boundary detection
    - All text in English

## 📄 License

MIT License

---
*BioViz Local - Making bioinformatics analysis simpler, safer, and smarter.*
