// src/models/Token.ts

/**
 * Patient source types with priority implications
 */
export enum PatientSource {
    WALKIN = 'WALKIN',       // Lowest priority
    FOLLOWUP = 'FOLLOWUP',   // Follow-up patients (continuity of care)
    ONLINE = 'ONLINE',       // Medium priority
    REFERRAL = 'REFERRAL',   // High priority (paid priority patients)
    EMERGENCY = 'EMERGENCY'  // Highest priority
}

/**
 * Token flexibility levels for reshuffling
 * Determines how easily a token can be moved to accommodate emergencies
 */
export enum TokenFlexibility {
    HIGH = 'HIGH',      // WALKIN - very flexible, can be moved easily
    MEDIUM = 'MEDIUM',  // ONLINE, REFERRAL - somewhat flexible
    LOW = 'LOW'         // PAID/PREMIUM - not flexible (future use)
}

/**
 * Token lifecycle states
 * 
 * Valid transitions:
 * - REQUESTED → QUEUED (when token enters queue)
 * - QUEUED → ALLOCATED (when assigned to slot)
 * - ALLOCATED → CANCELLED (patient cancels)
 * - ALLOCATED → NO_SHOW (patient doesn't show up)
 * - ALLOCATED → COMPLETED (consultation done)
 * - ALLOCATED → REQUEUED (only via doctor delay event)
 */
export enum TokenStatus {
    REQUESTED = 'REQUESTED',
    QUEUED = 'QUEUED',
    ALLOCATED = 'ALLOCATED',
    CANCELLED = 'CANCELLED',
    NO_SHOW = 'NO_SHOW',
    COMPLETED = 'COMPLETED',
    REQUEUED = 'REQUEUED'
}

/**
 * Token model - represents a patient's request for consultation
 * 
 * Data only, no methods. State mutations handled by engine/events.
 */
export interface Token {
    id: string;
    patientName: string;
    patientAge: number;
    source: PatientSource;
    status: TokenStatus;

    // Allocation tracking
    doctorId: string | null;
    slotIndex: number | null;

    // Priority and timing
    priorityScore: number;  // Calculated by priorityCalculator
    requestedAt: Date;
    allocatedAt: Date | null;
    completedAt: Date | null;

    // Reshuffling support (optional)
    flexibility?: TokenFlexibility;  // How easily this token can be moved
}
