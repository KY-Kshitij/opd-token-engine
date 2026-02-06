// src/models/Slot.ts

/**
 * Slot availability status
 */
export enum SlotStatus {
    AVAILABLE = 'AVAILABLE',  // Has capacity for more tokens
    FULL = 'FULL',            // At capacity
    BLOCKED = 'BLOCKED'       // Doctor delay or unavailable
}

/**
 * Slot model - represents a time window for consultations
 * 
 * Data only, no methods. Capacity enforcement handled by engine.
 * 
 * Invariant: allocatedTokenIds.length <= capacity
 * Invariant: emergencyCount <= maxEmergenciesPerSlot (if configured)
 */
export interface Slot {
    startTime: Date;
    endTime: Date;
    capacity: number;           // Maximum tokens this slot can handle
    allocatedTokenIds: string[]; // Currently allocated token IDs
    status: SlotStatus;
    emergencyCount: number;     // Track emergency allocations for quota enforcement
}
