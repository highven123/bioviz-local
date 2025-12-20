import React, { useState, useEffect, useRef } from 'react';
import { eventBus, BioVizEvents } from '../stores/eventBus';
import './RuntimeLogPanel.css';

interface LogEntry {
    id: string;
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'debug';
    source: 'frontend' | 'backend' | 'system';
    message: string;
    payload?: any;
}

export const RuntimeLogPanel: React.FC<{
    onClose: () => void;
}> = ({ onClose }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState<'all' | 'info' | 'warning' | 'error'>('all');
    const scrollRef = useRef<HTMLDivElement>(null);

    const addLog = (message: string, level: LogEntry['level'] = 'info', source: LogEntry['source'] = 'system', payload?: any) => {
        const entry: LogEntry = {
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toLocaleTimeString(),
            level,
            source,
            message,
            payload
        };
        setLogs(prev => [...prev.slice(-199), entry]); // Keep last 200 logs
    };

    useEffect(() => {
        // Subscribe to all EventBus events
        const subscriptions: string[] = [];

        Object.values(BioVizEvents).forEach(eventType => {
            const subId = eventBus.subscribe(eventType, (payload) => {
                // Special handling for APP_LOG
                if (eventType === 'APP_LOG' && payload && typeof payload.message === 'string') {
                    addLog(payload.message, 'info', 'frontend');
                } else {
                    // For other events, show event type
                    const message = `${eventType}`;
                    addLog(message, 'debug', 'system', payload);
                }
            });
            subscriptions.push(subId);
        });

        // Add some initial logs
        addLog('Runtime Log Monitor Started', 'info', 'system');
        addLog('Listening for application events...', 'debug', 'system');

        return () => {
            Object.values(BioVizEvents).forEach((eventType, idx) => {
                eventBus.unsubscribe(eventType, subscriptions[idx]);
            });
        };
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const filteredLogs = logs.filter(log => {
        if (filter === 'all') return true;
        return log.level === filter;
    });

    return (
        <div className="runtime-log-panel">
            <div className="log-header">
                <div className="title">
                    <span className="icon">📋</span>
                    运行日志 (Log)
                </div>
                <div className="controls">
                    <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
                        <option value="all">全部日志</option>
                        <option value="info">常规</option>
                        <option value="warning">警告</option>
                        <option value="error">错误</option>
                    </select>
                    <button className="clear-btn" onClick={() => setLogs([])}>清除</button>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>
            </div>
            <div className="log-body" ref={scrollRef}>
                {filteredLogs.length === 0 ? (
                    <div className="empty-logs">等待事件触发...</div>
                ) : (
                    filteredLogs.map(log => (
                        <div key={log.id} className={`log-entry ${log.level}`}>
                            <span className="time">[{log.timestamp}]</span>
                            <span className="source">[{log.source.toUpperCase()}]</span>
                            <span className="message">{log.message}</span>
                            {log.payload && (
                                <details className="payload">
                                    <summary>Details</summary>
                                    <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                                </details>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default RuntimeLogPanel;
