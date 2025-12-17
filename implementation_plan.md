# AI Scientific Analysis Prompt System

将6种科研分析 Prompt Templates 集成到 BioViz 现有AI系统中，提供结构化的科研级输出。

## Proposed Changes

### Python Backend

---

#### [NEW] [prompts.py](file:///Users/haifeng/BioViz-Local/python/prompts.py)

专门的 Prompt Templates 模块，包含所有结构化提示词。

**Phase 1 Prompts (基础分析):**
- `PATHWAY_ENRICHMENT_PROMPT` - 通路富集结果解释
- `DE_SUMMARY_PROMPT` - 差异表达基因统计总结  
- `NL_FILTER_PROMPT` - 自然语言筛选条件解析
- `VISUALIZATION_PROMPT` - 富集图趋势描述

**Phase 3 Prompts (实验推理):**
- `HYPOTHESIS_PROMPT` - 机制假设生成（标注为假设）
- `PATTERN_DISCOVERY_PROMPT` - 探索性模式发现

**边缘处理规则:**
- 无显著结果时的标准响应
- 数据缺失时要求用户补充
- 区分事实输出 vs 推测性输出

---

#### [MODIFY] [ai_tools.py](file:///Users/haifeng/BioViz-Local/python/ai_tools.py)

添加新的 AI 工具函数：
- `summarize_enrichment` - 调用富集解释 prompt
- `summarize_de_genes` - 调用差异基因 prompt
- `parse_filter_query` - 解析自然语言筛选
- `describe_visualization` - 描述图表趋势
- `generate_hypothesis` - 生成机制假设
- `discover_patterns` - 探索性模式分析

---

#### [MODIFY] [bio_core.py](file:///Users/haifeng/BioViz-Local/python/bio_core.py)

添加新的命令处理器：
- `SUMMARIZE_ENRICHMENT` - 富集结果总结
- `SUMMARIZE_DE` - 差异表达总结
- `PARSE_FILTER` - 筛选条件解析
- `GENERATE_HYPOTHESIS` - 假设生成
- `DISCOVER_PATTERNS` - 模式发现

---

### TypeScript Frontend

---

#### [MODIFY] [useBioEngine.ts](file:///Users/haifeng/BioViz-Local/src/hooks/useBioEngine.ts)

添加新的命令发送函数：
- `summarizeEnrichment(enrichmentData)`
- `summarizeDifferentialExpression(volcanoData)`
- `parseFilterQuery(naturalLanguageQuery)`
- `generateHypothesis(significantGenes, pathways)`

---

#### [MODIFY] [AIEventPanel.tsx](file:///Users/haifeng/BioViz-Local/src/components/AIEventPanel.tsx)

添加新的 Skill 按钮：
- "Explain" - 解释富集结果
- "Summarize" - 总结差异基因
- "Hypothesis" - 生成机制假设（标注 Phase 3）

---

## Verification Plan

### Automated Tests

```bash
# 测试 Prompt 模块
python -c "from prompts import PATHWAY_ENRICHMENT_PROMPT; print('OK')"

# 测试新命令
echo '{"cmd": "SUMMARIZE_ENRICHMENT", "payload": {...}}' | ./bio-engine
```

### Manual Verification

1. 加载数据后点击 "Explain" 按钮，验证输出格式
2. 验证无显著结果时的边缘处理
3. 验证假设输出包含 "Hypothesis (not validated)" 标签
4. 重新打包并测试 DMG

---

## Implementation Sequence

1. 创建 `prompts.py` 模块
2. 更新 `ai_tools.py` 添加新工具
3. 更新 `bio_core.py` 添加命令处理
4. 更新前端 `useBioEngine.ts`
5. 更新 `AIEventPanel.tsx` UI
6. 测试并打包
