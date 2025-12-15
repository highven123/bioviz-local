/**
 * Global Event Bus for BioViz v2.0
 * Enables AI to subscribe to app-wide events and react proactively.
 */

type EventCallback = (payload: any) => void;

interface EventSubscription {
    id: string;
    callback: EventCallback;
}

class EventBus {
    private events: Map<string, EventSubscription[]> = new Map();
    private eventIdCounter = 0;

    /**
     * Subscribe to an event
     */
    subscribe(event: string, callback: EventCallback): string {
        const id = `sub_${++this.eventIdCounter}`;
        const subscriptions = this.events.get(event) || [];
        subscriptions.push({ id, callback });
        this.events.set(event, subscriptions);
        console.log(`[EventBus] Subscribed to ${event} (id: ${id})`);
        return id;
    }

    /**
     * Unsubscribe from an event
     */
    unsubscribe(event: string, subscriptionId: string): void {
        const subscriptions = this.events.get(event);
        if (subscriptions) {
            this.events.set(
                event,
                subscriptions.filter((s) => s.id !== subscriptionId)
            );
            console.log(`[EventBus] Unsubscribed ${subscriptionId} from ${event}`);
        }
    }

    /**
     * Emit an event to all subscribers
     */
    emit(event: string, payload?: any): void {
        console.log(`[EventBus] Emitting ${event}`, payload ? '(with payload)' : '');
        const subscriptions = this.events.get(event) || [];
        subscriptions.forEach((sub) => {
            try {
                sub.callback(payload);
            } catch (error) {
                console.error(`[EventBus] Error in subscriber ${sub.id}:`, error);
            }
        });
    }

    /**
     * Get all registered events
     */
    getRegisteredEvents(): string[] {
        return Array.from(this.events.keys());
    }
}

// Singleton instance
export const eventBus = new EventBus();

// Event type constants
export const BioVizEvents = {
    // Data lifecycle
    DATA_LOADED: 'DATA_LOADED',
    DATA_VALIDATED: 'DATA_VALIDATED',

    // Analysis lifecycle
    ANALYSIS_STARTED: 'ANALYSIS_STARTED',
    ANALYSIS_COMPLETE: 'ANALYSIS_COMPLETE',
    GSEA_COMPLETE: 'GSEA_COMPLETE',

    // Pathway lifecycle
    PATHWAY_SELECTED: 'PATHWAY_SELECTED',
    PATHWAY_RENDERED: 'PATHWAY_RENDERED',

    // Image lifecycle
    IMAGE_UPLOADED: 'IMAGE_UPLOADED',
    IMAGE_ANALYZED: 'IMAGE_ANALYZED',

    // AI lifecycle
    AI_SUGGESTION: 'AI_SUGGESTION',
    AI_WARNING: 'AI_WARNING',

    // Multi-sample
    SAMPLE_GROUP_CHANGED: 'SAMPLE_GROUP_CHANGED',
} as const;

export type BioVizEventType = keyof typeof BioVizEvents;
