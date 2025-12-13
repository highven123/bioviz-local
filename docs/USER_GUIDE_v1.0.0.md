# BioViz Local v1.0.0 使用说明

面向当前版本（包含自动/手动原始矩阵处理、KEGG 按钮、新样式）的快速指南。

## 启动
- 开发模式：`npm run tauri dev`
- 需要本地 Python（sidecar 自动随 Tauri 启动）

## 核心流程（四步）
1) **Import Data**：选择数据类型（Transcriptomics / Proteomics / Flow），上传 `.csv/.tsv/.xlsx` 宽格式矩阵。  
2) **Map Columns**：映射实体列与数值列，或在原始矩阵模式下选择/自动识别 Ctrl 与 Exp 列。  
3) **Select Pathway**：在模板列表中选择 KEGG 通路模板。  
4) **Visualize**：查看火山图/MA/排序表/通路网络与证据。

## 数据格式支持
- **Summary 表**：已有 `Gene/Protein/Cell` 列 + `Log2FC/Value` 列，可选 `P-value` 列。  
- **原始矩阵（自动/手动）**：存在多列 `Ctrl_*` 和 `Exp_*` 强度，无 P 值。自动计算 Log2FC 与近似 P 值；可切换为手动指定哪些列是对照/实验。

## 映射规则
- **实体列 (required)**：Gene/Protein/Cell 名称或 ID。  
- **数值列 (summary 模式，required)**：Log2FC 或表达/强度。  
- **P-value (optional)**：有则用于火山图显著性。  
- **原始矩阵模式**  
  - 默认 **Auto**：检测到 Ctrl_*/Exp_* 且无 P 值时，自动用所有 Ctrl/Exp 列计算。无需选择 Value。  
  - **Manual**：可勾选具体 Ctrl 列、Exp 列（各至少 1 列），按钮才会亮。  
  - 若你有预计算的 Log2FC/P 值，请用 summary 模式（选择对应列，并勾选 “Use existing Log2FC / P-Value”）。

## 分析方法（可多选）
- `Auto (recommended)`：自动选择合适方法。  
- `Use existing Log2FC / P-Value`：表中已有统计结果时勾选。  
- `Two-group t-test (Ctrl vs Exp)`：原始矩阵可选。  
> 可多选，但可视化结果使用第一个方法作为主输出。

## 通路选择与 KEGG
- 在 Step 3 选择模板；进入可视化后可用工具栏里的 `KEGG` 按钮在浏览器打开对应通路页面，下载官方 PNG/PDF/KGML。

## 可视化工作台
- 左侧：Volcano / MA / Ranked / Table（MA 需 mean 数据）。  
- 中间：Pathway 图，可点节点同步右侧证据；工具栏支持 Reset、PNG、SVG、PPTX、Data、KEGG。  
- 右侧：Evidence 面板显示当前节点/基因细节。

## 导出与命名
- **PNG / SVG / PPTX**：从 Pathway 工具栏导出，默认建议名包含上传文件名与时间戳。  
- **数据表 CSV**：`Data` 按钮导出，建议名：`<上传文件名>_stat_<时间戳>.csv`。  
- **报告 PPTX**：建议名：`report_<上传文件名>_<时间戳>.pptx`。  
- **图片**：建议名：`png_<上传文件名>_<时间戳>` 或 `svg_<上传文件名>_<时间戳>`。

## 常见问题
- **按钮灰不可点**：  
  - summary 模式需选实体列 + Value 列；原始矩阵手动模式需至少选 1 个 Ctrl 和 1 个 Exp。  
  - 未选通路时无法进入可视化。  
- **数据无 P 值**：仍可运行，P 值默认置 1，用 Log2FC 着色。  
- **通路不匹配**：确保模板 ID 正确（如 `hsa04151`）；可用 KEGG 按钮核对。
