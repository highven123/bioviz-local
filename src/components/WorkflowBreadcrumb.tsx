import React from 'react';

export type WorkflowStep = 'upload' | 'mapping' | 'viz';

interface Props {
    currentStep: WorkflowStep;
    canAccessMapping: boolean;
    canAccessViz: boolean;
    onStepClick: (step: WorkflowStep) => void;
    variant?: 'horizontal' | 'vertical' | 'hub';
}

const STEPS: { key: WorkflowStep; label: string; icon: string }[] = [
    { key: 'upload', label: 'Import Data', icon: '📥' },
    { key: 'mapping', label: 'Map Columns', icon: '🗺️' },
    { key: 'viz', label: 'Visualize', icon: '🔬' }
];

export const WorkflowBreadcrumb: React.FC<Props> = ({ currentStep, onStepClick, variant = 'horizontal', ...props }) => {
    const stepOrder = ['upload', 'mapping', 'viz'];
    const currentIndex = stepOrder.indexOf(currentStep);

    const canAccess = (stepKey: WorkflowStep) => {
        const stepIndex = stepOrder.indexOf(stepKey);
        return stepIndex <= currentIndex ||
            (stepKey === 'mapping' && props.canAccessMapping) ||
            (stepKey === 'viz' && props.canAccessViz);
    };

    if (variant === 'vertical') {
        return (
            <div className="sidebar-nav-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {STEPS.map((step, index) => {
                    const isCurrent = step.key === currentStep;
                    const isCompleted = index < currentIndex;
                    const isSelectable = canAccess(step.key);

                    return (
                        <div
                            key={step.key}
                            className={`sidebar-nav-item ${isCurrent ? 'active' : ''}`}
                            onClick={() => isSelectable && onStepClick(step.key)}
                            style={{
                                opacity: isSelectable ? 1 : 0.4,
                                cursor: isSelectable ? 'pointer' : 'default',
                                position: 'relative'
                            }}
                        >
                            <div style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: isCompleted ? '#10b981' : (isCurrent ? 'var(--brand-primary)' : '#374151'),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 'bold'
                            }}>
                                {isCompleted ? '✓' : index + 1}
                            </div>
                            <span style={{ flex: 1 }}>{step.label}</span>
                            {isCurrent && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--brand-primary)' }} />}
                        </div>
                    );
                })}
            </div>
        );
    }

    if (variant === 'hub') {
        return (
            <div className="operation-hub-bar" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '0 16px',
                height: '40px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                width: '100%',
                maxWidth: '1200px'
            }}>
                {/* Slim Stepper */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {STEPS.map((step, index) => {
                        const isCurrent = step.key === currentStep;
                        const isCompleted = index < currentIndex;
                        const isSelectable = canAccess(step.key);

                        return (
                            <div
                                key={step.key}
                                onClick={() => isSelectable && onStepClick(step.key)}
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: isCompleted ? 'var(--color-success)' : (isCurrent ? 'var(--brand-primary)' : 'transparent'),
                                    border: isCurrent || isCompleted ? 'none' : '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: 'white',
                                    cursor: isSelectable ? 'pointer' : 'default',
                                    opacity: isSelectable ? 1 : 0.4,
                                    transition: 'all 0.2s',
                                    boxShadow: isCurrent ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none'
                                }}
                                title={step.label}
                            >
                                {isCompleted ? '✓' : index + 1}
                            </div>
                        );
                    })}
                </div>

                <div style={{ width: '1px', height: '20px', background: 'var(--border-subtle)' }} />

                {/* Hub Content Placeholder - will be populated by children or props later if needed */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: 'var(--text-dim)' }}>STP:</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{STEPS[currentIndex].label}</span>
                    </div>
                    {/* The slot for Data Info and Controls will be handled in App.tsx by wrapping this or passing children */}
                </div>
            </div>
        );
    }

    // Concept Circular Stepper (Horizontal)
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            marginBottom: '8px',
            marginTop: '8px'
        }}>
            <div style={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '12px 24px',
                width: '100%',
                maxWidth: '800px',
                display: 'flex',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {STEPS.map((step, index) => {
                    const isCurrent = step.key === currentStep;
                    const isCompleted = index < currentIndex;
                    const isActiveOrCompleted = index <= currentIndex;
                    const stepNum = index + 1;

                    return (
                        <div
                            key={step.key}
                            onClick={() => canAccess(step.key) && onStepClick(step.key)}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '6px',
                                position: 'relative',
                                zIndex: 2,
                                flex: 1,
                                cursor: canAccess(step.key) ? 'pointer' : 'default',
                                opacity: isActiveOrCompleted ? 1 : 0.5
                            }}
                        >
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: isCompleted || isCurrent ? '#10b981' : '#374151',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                fontSize: '14px',
                                boxShadow: isCurrent ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none',
                                transition: 'all 0.3s ease'
                            }}>
                                {isCompleted ? '✓' : stepNum}
                            </div>
                            <span style={{
                                fontSize: '12px',
                                color: '#d1d5db',
                                fontWeight: isCurrent ? 600 : 400
                            }}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
