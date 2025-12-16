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
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ sendCommand, isConnected, lastResponse, analysisContext }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Listen for AI responses from useBioEngine's lastResponse
    useEffect(() => {
        console.log('[AIChatPanel] lastResponse changed:', lastResponse);

        if (!lastResponse) return;

        try {
            console.log('[AIChatPanel] Response type:', lastResponse.type, 'cmd:', lastResponse.cmd);

            // Handle both CHAT and EXECUTE responses
            if (lastResponse.cmd === 'CHAT' && (lastResponse.type === 'CHAT' || lastResponse.type === 'EXECUTE')) {
                console.log('[AIChatPanel] Processing AI response, content:', lastResponse.content?.substring(0, 50));

                setMessages(prev => {
                    // Remove the last "Processing..." message if it exists
                    const filtered = prev.filter(m => m.content !== 'Processing your request...');

                    console.log('[AIChatPanel] Filtered messages count:', filtered.length);

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
                            } else if (typeof result === 'object') {
                                responseContent += `\n\n**结果**: ${JSON.stringify(result, null, 2)}`;
                            } else {
                                responseContent += `\n\n**结果**: ${String(result)}`;
                            }
                        }
                    }

                    // Add AI response
                    return [...filtered, {
                        role: 'assistant',
                        content: responseContent,
                        timestamp: Date.now()
                    }];
                });
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

            // Add placeholder while waiting for response
            const placeholderMessage: Message = {
                role: 'assistant',
                content: 'Processing your request...',
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, placeholderMessage]);
        } catch (error) {
            console.error('Failed to send message:', error);
            const errorMessage: Message = {
                role: 'assistant',
                content: 'Sorry, I encountered an error processing your request.',
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMessage]);
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

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
                {messages.length === 0 && (
                    <div className="welcome-message">
                        <p>👋 Hi! I'm your BioViz AI assistant.</p>
                        <p>Try asking me:</p>
                        <ul>
                            <li>"Show me the apoptosis pathway"</li>
                            <li>"List available pathways"</li>
                            <li>"Explain the PI3K-Akt pathway"</li>
                        </ul>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role}`}>
                        <div className="message-avatar">
                            {msg.role === 'user' ? '👤' : '🤖'}
                        </div>
                        <div className="message-content">
                            <div className="message-text">{msg.content}</div>
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
