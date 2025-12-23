/**
 * AI Chat Panel - BioViz AI Assistant
 */

import React, { useState, useRef, useEffect } from 'react';
import './AIChatPanel.css';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface AIChatPanelProps {
    sendCommand: (cmd: string, data?: Record<string, unknown>) => Promise<void>;
    isConnected: boolean;
    lastResponse: any; // Response from useBioEngine
    analysisContext?: {
        pathway?: any;
        volcanoData?: any[];
        statistics?: any;
    };
    chatHistory?: Message[];  // Chat history from parent
    onChatUpdate?: (messages: Message[]) => void;  // Callback to update parent
    workflowPhase?: 'perception' | 'exploration' | 'synthesis';
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
    sendCommand,
    isConnected,
    lastResponse,
    analysisContext,
    chatHistory = [],
    onChatUpdate,
    workflowPhase = 'perception'
}) => {
    const [messages, setMessages] = useState<Message[]>(chatHistory);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isInternalUpdate = useRef(false);

    // Sync with parent chatHistory when it changes (e.g., switching analysis)
    useEffect(() => {
        if (chatHistory && JSON.stringify(chatHistory) !== JSON.stringify(messages)) {
            isInternalUpdate.current = false;
            setMessages(chatHistory);
        }
    }, [chatHistory]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Format AI content: convert markdown-style lists to HTML
    const formatAIContent = (content: string) => {
        // Split into lines
        const lines = content.split('\n');
        const elements: React.ReactNode[] = [];
        let currentList: string[] = [];
        let listType: 'ul' | 'ol' | null = null;

        const flushList = (lineIdx: number) => {
            if (currentList.length > 0 && listType) {
                const ListTag = listType === 'ol' ? 'ol' : 'ul';
                elements.push(
                    <ListTag key={`list-${lineIdx}-${elements.length}`} className="ai-list">
                        {currentList.map((item, i) => <li key={i}>{item}</li>)}
                    </ListTag>
                );
                currentList = [];
                listType = null;
            }
        };

        lines.forEach((line, idx) => {
            const trimmed = line.trim();

            // Check for bullet list items (- or *)
            const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
            // Check for numbered list items (1., 2., etc.)
            const numMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
            // Check for bold headers (**text**)
            const boldMatch = trimmed.match(/^\*\*(.+?)\*\*/);

            if (bulletMatch) {
                if (listType !== 'ul') flushList(idx);
                listType = 'ul';
                currentList.push(bulletMatch[1]);
            } else if (numMatch) {
                if (listType !== 'ol') flushList(idx);
                listType = 'ol';
                currentList.push(numMatch[1]);
            } else {
                flushList(idx);
                if (boldMatch) {
                    elements.push(<strong key={`bold-${idx}`} className="ai-bold">{boldMatch[1]}</strong>);
                    const rest = trimmed.replace(/^\*\*(.+?)\*\*:?\s*/, '');
                    if (rest) elements.push(<span key={`rest-${idx}`}>{rest}</span>);
                } else if (trimmed) {
                    elements.push(<p key={`para-${idx}`} className="ai-paragraph">{trimmed}</p>);
                }
            }
        });

        flushList(lines.length);
        return elements.length > 0 ? elements : content;
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Helper to update messages and notify parent
    const updateMessages = (updater: (prev: Message[]) => Message[]) => {
        setMessages(prev => {
            const next = updater(prev);
            return next;
        });
    };

    // Notify parent when messages change
    useEffect(() => {
        if (onChatUpdate && messages.length > 0) {
            if (isInternalUpdate.current) {
                // Only notify if different from chatHistory to prevent loops
                if (JSON.stringify(messages) !== JSON.stringify(chatHistory)) {
                    onChatUpdate(messages);
                }
                isInternalUpdate.current = false;
            }
        }
    }, [messages, chatHistory, onChatUpdate]);

    // Listen for AI responses from useBioEngine's lastResponse
    useEffect(() => {
        console.log('[AIChatPanel] lastResponse changed:', lastResponse);

        if (!lastResponse) return;

        try {
            console.log('[AIChatPanel] Response type:', lastResponse.type, 'cmd:', lastResponse.cmd);

            // Handle both CHAT and EXECUTE responses
            const structuredCmds = new Set(['SUMMARIZE_ENRICHMENT', 'SUMMARIZE_DE', 'PARSE_FILTER', 'GENERATE_HYPOTHESIS', 'DISCOVER_PATTERNS', 'DESCRIBE_VISUALIZATION']);
            if (lastResponse.cmd === 'CHAT' && (lastResponse.type === 'CHAT' || lastResponse.type === 'EXECUTE')) {
                console.log('[AIChatPanel] Processing AI response, content:', lastResponse.content?.substring(0, 50));

                isInternalUpdate.current = true;
                setMessages(prev => {
                    // Build response content
                    let responseContent = lastResponse.content;

                    // If this is an EXECUTE action, add tool execution details
                    if (lastResponse.type === 'EXECUTE' && lastResponse.tool_name) {
                        responseContent += `\n\n**🔧 执行工具**: ${lastResponse.tool_name}`;

                        // Format and display tool results
                        if (lastResponse.tool_result) {
                            const result = lastResponse.tool_result;

                            if (lastResponse.tool_name === 'list_pathways' && Array.isArray(result)) {
                                responseContent += `\n\n**可用通路列表** (${result.length}个):`;
                                result.forEach((p: any) => {
                                    responseContent += `\n• ${p.id}: ${p.name}`;
                                });
                            } else if (lastResponse.tool_name === 'render_pathway' && result.pathway) {
                                const pathway = result.pathway;
                                const stats = result.statistics || {};
                                responseContent += `\n\n**通路**: ${pathway.title || pathway.id}`;
                                responseContent += `\n**基因数**: ${stats.total_nodes || 0}`;
                                responseContent += `\n**上调**: ${stats.upregulated || 0} | **下调**: ${stats.downregulated || 0}`;
                            } else if (lastResponse.tool_name === 'run_enrichment') {
                                if (result.error) {
                                    responseContent += `\n\n**错误**: ${result.error}`;
                                } else {
                                    responseContent += `\n\n**富集分析结果**:`;
                                    responseContent += `\n• 基因数: ${result.input_genes}`;
                                    responseContent += `\n• 基因库: ${result.gene_sets}`;
                                    responseContent += `\n• 富集条目: ${result.total_terms}\n`;

                                    if (result.enriched_terms && result.enriched_terms.length > 0) {
                                        responseContent += `\n**Top 10 显著通路**:\n`;
                                        result.enriched_terms.slice(0, 10).forEach((term: any, idx: number) => {
                                            const pval = term.adjusted_p_value || term.p_value;
                                            responseContent += `${idx + 1}. **${term.term}**\n`;
                                            responseContent += `   - P-value: ${pval.toExponential(2)}\n`;
                                            responseContent += `   - Genes: ${term.overlap}\n`;
                                        });
                                    }
                                }
                            } else if (typeof result === 'object') {
                                responseContent += `\n\n**结果**: ${JSON.stringify(result, null, 2)}`;
                            } else {
                                responseContent += `\n\n**结果**: ${String(result)}`;
                            }
                        }
                    }

                    // Add AI response
                    return [...prev, {
                        role: 'assistant',
                        content: responseContent,
                        timestamp: Date.now()
                    }];
                });
                setIsLoading(false);
            } else if (lastResponse.cmd && structuredCmds.has(lastResponse.cmd)) {
                // Display structured prompt responses (e.g., SUMMARIZE_ENRICHMENT)
                const content = lastResponse.summary || lastResponse.content || lastResponse.message;
                if (content) {
                    updateMessages(prev => [
                        ...prev,
                        { role: 'assistant', content, timestamp: Date.now() }
                    ]);
                }
                setIsLoading(false);
            } else {
                console.log('[AIChatPanel] Ignoring non-CHAT response');
            }
        } catch (error) {
            console.error('[AIChatPanel] Failed to process AI response:', error);
        }
    }, [lastResponse]);

    const handleSend = async () => {
        if (!input.trim() || !isConnected || isLoading) return;

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
            timestamp: Date.now()
        };

        isInternalUpdate.current = true;
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            // Send CHAT command to backend with analysis context
            await sendCommand('CHAT', {
                query: userMessage.content,
                history: messages.slice(-10).map(m => ({
                    role: m.role,
                    content: m.content
                })),
                context: analysisContext || {}
            });
        } catch (error) {
            console.error('Failed to send message:', error);
            const errorMessage: Message = {
                role: 'assistant',
                content: 'Sorry, I encountered an error processing your request.',
                timestamp: Date.now()
            };
            updateMessages(prev => [...prev, errorMessage]);
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };


    const milestoneInfo = {
        perception: { title: "🎯 Stage 1: Perception", hint: "AI has scanned your data. Review the initial insights." },
        exploration: { title: "🔍 Stage 2: Exploration", hint: "Deep dive into pathways and evidence. Use tools to investigate." },
        synthesis: { title: "🤖 Stage 3: Synthesis", hint: "Consolidating all evidence into a consistent mechanism." }
    };

    const currentMilestone = milestoneInfo[workflowPhase] || milestoneInfo['perception'];

    return (
        <div className="ai-chat-panel">
            <div className="chat-header">
                <div className="header-title">
                    <span className="ai-icon">🤖</span>
                    <span>BioViz AI Assistant</span>
                </div>
                <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
                    {isConnected ? '● Online' : '● Offline'}
                </div>
            </div>

            <div className="chat-messages">
                <div className="milestone-badge">
                    <span className="milestone-title">{currentMilestone.title}</span>
                    <span className="milestone-hint">{currentMilestone.hint}</span>
                </div>

                {messages.length === 0 && (
                    <div className="welcome-message" style={{ padding: '20px 16px' }}>
                        <p style={{ fontSize: '15px', fontWeight: 600 }}>👋 {currentMilestone.title}</p>
                        <p style={{ fontSize: '13px', opacity: 0.8 }}>Choose a smart skill below to start your discovery.</p>
                    </div>
                )}


                {messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role}`}>
                        <div className="message-avatar">
                            {msg.role === 'user' ? '👤' : '🤖'}
                        </div>
                        <div className="message-content">
                            <div className="message-text">
                                {msg.role === 'assistant' ? formatAIContent(msg.content) : msg.content}
                            </div>
                            <div className="message-time">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                            </div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="message assistant">
                        <div className="message-avatar">🤖</div>
                        <div className="message-content">
                            <div className="typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container">
                <textarea
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask me anything about pathways..."
                    rows={2}
                    disabled={!isConnected || isLoading}
                />
                <button
                    className="send-button"
                    onClick={handleSend}
                    disabled={!input.trim() || !isConnected || isLoading}
                >
                    Send
                </button>
            </div>
        </div>
    );
};
