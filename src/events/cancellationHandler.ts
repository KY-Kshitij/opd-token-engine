// src/events/cancellationHandler.ts

import { Token, TokenStatus } from '../models/Token';
import { Doctor } from '../models/Doctor';
import { AllocationEngine } from '../engine/allocationEngine';

/**
 * Handle patient cancellation event
 * 
 * State transition: ALLOCATED → CANCELLED
 * 
 * Side effects:
 * 1. Free slot capacity
 * 2. Trigger queue processing to fill freed slot
 */
export function handleCancellation(
    token: Token,
    doctor: Doctor,
    allocationEngine: AllocationEngine
): void {
    // Validate current state
    if (token.status !== TokenStatus.ALLOCATED) {
        throw new Error(`Cannot cancel token ${token.id} with status ${token.status}`);
    }

    if (!token.doctorId || token.slotIndex === null) {
        throw new Error(`Token ${token.id} marked as allocated but missing doctor/slot info`);
    }

    // Free token from slot
    allocationEngine.freeTokenFromSlot(token, doctor);

    // Update token state
    token.status = TokenStatus.CANCELLED;
    token.completedAt = new Date();

    // Attempt to fill freed slot from queue
    allocationEngine.allocateFromQueue(doctor.id, doctor);
}
