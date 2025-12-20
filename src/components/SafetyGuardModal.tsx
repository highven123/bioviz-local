/**
 * SafetyGuardModal - Frontend Legal Firewall
 * 
 * This component intercepts AI PROPOSAL actions and blocks all app interaction
 * until the user explicitly confirms or rejects the proposed action.
 * 
 * CRITICAL: This is a compliance mechanism, not a UX feature.
 * - Yellow Zone: User can Confirm or Reject
 * - Red Zone: User can ONLY Reject (Confirm button is blocked)
 */

import React from 'react';
import { AIActionResponse, isRedZone } from '../types/aiSafety';
import './SafetyGuardModal.css';

interface SafetyGuardModalProps {
    proposal: AIActionResponse | null;
    onRespond: (proposalId: string, accepted: boolean) => void;
}

export const SafetyGuardModal: React.FC<SafetyGuardModalProps> = ({ proposal, onRespond }) => {
    if (!proposal || proposal.type !== 'PROPOSAL' || !proposal.proposal_id) {
        return null;
    }

    const isRed = isRedZone(proposal);
    const safetyLevel = proposal.safety_level || 'YELLOW';

    const handleConfirm = () => {
        if (!isRed && proposal.proposal_id) {
            onRespond(proposal.proposal_id, true);
        }
    };

    const handleReject = () => {
        if (proposal.proposal_id) {
            onRespond(proposal.proposal_id, false);
        }
    };

    return (
        <div className="safety-guard-overlay" role="dialog" aria-modal="true" data-tauri-drag-region>
            <div className={`safety-guard-modal ${isRed ? 'red-zone' : 'yellow-zone'}`} data-tauri-drag-region="no-drag">
                {/* Header */}
                <div className="safety-guard-header">
                    <div className="safety-icon">
                        {isRed ? '🚫' : '⚠️'}
                    </div>
                    <div className="safety-title">
                        {isRed ? 'Action Blocked' : 'Action Requires Approval'}
                    </div>
                    <div className={`safety-badge ${safetyLevel.toLowerCase()}`}>
                        {safetyLevel}
                    </div>
                </div>

                {/* Content */}
                <div className="safety-guard-content">
                    <p className="safety-message">
                        {proposal.content}
                    </p>

                    {proposal.proposal_reason && (
                        <div className="safety-reason">
                            <strong>Reason:</strong> {proposal.proposal_reason}
                        </div>
                    )}

                    {proposal.tool_name && (
                        <div className="safety-details">
                            <div className="detail-row">
                                <span className="detail-label">Tool:</span>
                                <code className="detail-value">{proposal.tool_name}</code>
                            </div>
                            {proposal.tool_args && Object.keys(proposal.tool_args).length > 0 && (
                                <div className="detail-row">
                                    <span className="detail-label">Parameters:</span>
                                    <pre className="detail-json">
                                        {JSON.stringify(proposal.tool_args, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}

                    {isRed && (
                        <div className="red-zone-warning">
                            <strong>🔒 High-risk action blocked by system policy.</strong>
                            <p>This action cannot be authorized. Please contact your administrator if you believe this is an error.</p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="safety-guard-actions">
                    <button
                        className="safety-btn reject"
                        onClick={handleReject}
                    >
                        {isRed ? 'Dismiss' : 'Reject'}
                    </button>

                    {!isRed && (
                        <button
                            className="safety-btn confirm"
                            onClick={handleConfirm}
                        >
                            Confirm & Authorize
                        </button>
                    )}
                </div>

                {/* Footer */}
                <div className="safety-guard-footer">
                    <span className="proposal-id">ID: {proposal.proposal_id.slice(0, 8)}...</span>
                </div>
            </div>
        </div>
    );
};
