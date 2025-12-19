import React from 'react';

export type WorkflowStep = 'upload' | 'mapping' | 'viz';

interface Props {
    currentStep: WorkflowStep;
    canAccessMapping: boolean;
    canAccessViz: boolean;
    onStepClick: (step: WorkflowStep) => void;
}

const STEPS: { key: WorkflowStep; label: string }[] = [
    { key: 'upload', label: '1. Import Data' },
    { key: 'mapping', label: '2. Map Columns' },
    { key: 'viz', label: '3. Visualize' }
];

export const WorkflowBreadcrumb: React.FC<Props> = ({ currentStep, onStepClick, ...props }) => {
    // Simplified logic
    const stepOrder = ['upload', 'mapping', 'viz'];
    const currentIndex = stepOrder.indexOf(currentStep);

    const canAccess = (stepKey: WorkflowStep) => {
        const stepIndex = stepOrder.indexOf(stepKey);
        return stepIndex <= currentIndex ||
            (stepKey === 'mapping' && props.canAccessMapping) ||
            (stepKey === 'viz' && props.canAccessViz);
    };

    // Concept Circular Stepper
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            marginBottom: '8px', // Reduced margin
            marginTop: '8px'     // Optional: ensure tight top spacing
        }}>
            <div style={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px', // Slightly smaller radius
                padding: '12px 24px', // Reduced vertical padding
                width: '100%',
                maxWidth: '800px',    // Slightly smaller max width
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
                                gap: '6px', // Reduced gap
                                position: 'relative',
                                zIndex: 2,
                                flex: 1,
                                cursor: canAccess(step.key) ? 'pointer' : 'default',
                                opacity: isActiveOrCompleted ? 1 : 0.5
                            }}
                        >
                            {/* Circle */}
                            <div style={{
                                width: '32px', // Smaller circle
                                height: '32px',
                                borderRadius: '50%',
                                background: isCompleted || isCurrent ? '#10b981' : '#374151',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                fontSize: '14px', // Smaller font
                                boxShadow: isCurrent ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none',
                                transition: 'all 0.3s ease'
                            }}>
                                {stepNum}
                            </div>

                            {/* Label */}
                            <span style={{
                                fontSize: '12px', // Smaller label
                                color: '#d1d5db',
                                fontWeight: isCurrent ? 600 : 400
                            }}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}

                {/* Connecting Lines - simplified to just background dots or lines if needed, but the container look is safer */}
            </div>
        </div>
    );
};
