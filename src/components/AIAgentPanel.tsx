import React, { useState } from 'react';
import './AIAgentPanel.css';

interface AIAgentPanelProps {
    sendCommand: (cmd: string, data?: Record<string, unknown>) => Promise<void>;
    isConnected: boolean;
    lastResponse: any;
    analysisContext?: {
        pathway?: any;
        volcanoData?: any[];
        statistics?: any;
    };
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
    onChatUpdate?: (messages: any[]) => void;
    onNavigateToGSEA?: () => void;
    onExportSession?: () => void;
}

interface Skill {
    id: string;
    icon: string;
    label: string;
    description: string;
    action: () => void;
    disabled?: boolean;
}

export const AIAgentPanel: React.FC<AIAgentPanelProps> = ({
    sendCommand,
    isConnected,
    lastResponse,
    analysisContext,
    chatHistory = [],
    onChatUpdate,
    onNavigateToGSEA,
    onExportSession,
}) => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>>(chatHistory);
    const [isLoading, setIsLoading] = useState(false);

    // Sync with parent chatHistory
    React.useEffect(() => {
        setMessages(chatHistory);
    }, [chatHistory]);

    const updateMessages = (updater: (prev: any[]) => any[]) => {
        setMessages(prev => {
            const updated = updater(prev);
            if (onChatUpdate) onChatUpdate(updated);
            return updated;
        });
    };

    // Define AI Skills
    const skills: Skill[] = [
        {
            id: 'gsea',
            icon: '🔬',
            label: 'GSEA分析',
            description: '基因集富集分析',
            action: () => onNavigateToGSEA?.(),
            disabled: !analysisContext?.volcanoData
        },
        {
            id: 'enrichment',
            icon: '📊',
            label: '富集分析',
            description: '运行Enrichr分析',
            action: async () => {
                setIsLoading(true);
                await sendCommand('CHAT', {
                    query: '请对当前差异表达基因运行富集分析，告诉我哪些通路最显著',
                    context: analysisContext
                });
                setIsLoading(false);
            },
            disabled: !analysisContext?.volcanoData
        },
        {
            id: 'report',
            icon: '📝',
            label: '生成报告',
            description: '导出分析报告',
            action: () => onExportSession?.(),
            disabled: !analysisContext
        },
        {
            id: 'compare',
            icon: '🧬',
            label: '基因对比',
            description: '对比上下调基因',
            action: async () => {
                setIsLoading(true);
                await sendCommand('CHAT', {
                    query: '请分析当前数据中上调和下调基因的功能差异',
                    context: analysisContext
                });
                setIsLoading(false);
            },
            disabled: !analysisContext?.volcanoData
        },
        {
            id: 'trend',
            icon: '📈',
            label: '趋势分析',
            description: '多时间点趋势',
            action: async () => {
                setIsLoading(true);
                await sendCommand('CHAT', {
                    query: '请分析数据中的时间依赖性表达模式',
                    context: analysisContext
                });
                setIsLoading(false);
            },
            disabled: !analysisContext
        },
        {
            id: 'literature',
            icon: '🔍',
            label: '文献搜索',
            description: '搜索相关研究',
            action: async () => {
                setIsLoading(true);
                await sendCommand('CHAT', {
                    query: '请告诉我当前通路的最新研究进展和临床意义',
                    context: analysisContext
                });
                setIsLoading(false);
            },
            disabled: !analysisContext?.pathway
        },
    ];

    const handleSend = async () => {
        if (!input.trim() || !isConnected) return;

        const userMessage = { role: 'user' as const, content: input, timestamp: Date.now() };
        updateMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            await sendCommand('CHAT', { query: input, context: analysisContext });
        } catch (e) {
            console.error('Chat error:', e);
        }
        setIsLoading(false);
    };

    // Handle AI responses
    React.useEffect(() => {
        if (!lastResponse) return;
        const structuredCmds = new Set(['SUMMARIZE_ENRICHMENT', 'SUMMARIZE_DE', 'PARSE_FILTER', 'GENERATE_HYPOTHESIS', 'DISCOVER_PATTERNS', 'DESCRIBE_VISUALIZATION']);
        if (lastResponse.cmd === 'CHAT' && lastResponse.content) {
            updateMessages(prev => {
                const filtered = prev.filter(m => m.content !== 'Processing...');
                return [...filtered, { role: 'assistant', content: lastResponse.content, timestamp: Date.now() }];
            });
        } else if (lastResponse.cmd && structuredCmds.has(lastResponse.cmd)) {
            const content = lastResponse.summary || lastResponse.content || lastResponse.message;
            if (content) {
                updateMessages(prev => [...prev, { role: 'assistant', content, timestamp: Date.now() }]);
            }
        }
    }, [lastResponse]);

    return (
        <div className="ai-agent-panel">
            {/* Header */}
            <div className="agent-header">
                <div className="header-title">
                    <span className="ai-icon">🤖</span>
                    <span>AI Agent</span>
                </div>
                <div className={`status-badge ${isConnected ? 'online' : 'offline'}`}>
                    {isConnected ? (isLoading ? '思考中...' : 'Ready') : 'Offline'}
                </div>
            </div>

            {/* Skills Grid */}
            <div className="skills-section">
                <div className="skills-label">快捷技能</div>
                <div className="skills-grid">
                    {skills.map(skill => (
                        <button
                            key={skill.id}
                            className={`skill-card ${skill.disabled ? 'disabled' : ''}`}
                            onClick={skill.action}
                            disabled={skill.disabled || isLoading}
                            title={skill.description}
                        >
                            <span className="skill-icon">{skill.icon}</span>
                            <span className="skill-label">{skill.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Chat Section */}
            <div className="chat-section">
                <div className="chat-messages">
                    {messages.length === 0 ? (
                        <div className="empty-chat">
                            <span>💬</span>
                            <p>有什么可以帮您的？</p>
                            <small>点击上方技能卡片或直接输入问题</small>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={`message ${msg.role}`}>
                                <div className="message-content">{msg.content}</div>
                            </div>
                        ))
                    )}
                    {isLoading && (
                        <div className="message assistant loading">
                            <div className="typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input */}
                <div className="chat-input-area">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="输入问题..."
                        disabled={!isConnected || isLoading}
                    />
                    <button onClick={handleSend} disabled={!isConnected || isLoading || !input.trim()}>
                        发送
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AIAgentPanel;
