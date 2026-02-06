// src/events/doctorDelayHandler.ts

import { Doctor } from '../models/Doctor';
import { SlotStatus } from '../models/Slot';
import { Token } from '../models/Token';
import { AllocationEngine } from '../engine/allocationEngine';

/**
 * Handle doctor delay event
 * 
 * When a doctor is delayed, affected slots are blocked and all tokens
 * in those slots must be reallocated to available slots.
 * 
 * This is the ONLY event that triggers ALLOCATED → REQUEUED transition
 * 
 * @param doctor Doctor who is delayed
 * @param delayMinutes How many minutes of delay
 * @param tokens All tokens (for lookup during reallocation)
 * @param allocationEngine Allocation engine
 * @returns Tokens that were requeued
 */
export function handleDoctorDelay(
    doctor: Doctor,
    delayMinutes: number,
    tokens: Map<string, Token>,
    allocationEngine: AllocationEngine
): Token[] {
    // Calculate which slots are affected by the delay
    const now = new Date();
    const delayEndTime = new Date(now.getTime() + delayMinutes * 60000);

    let firstAffectedSlot = -1;

    // Find first slot that starts before delay ends
    for (let i = 0; i < doctor.slots.length; i++) {
        const slot = doctor.slots[i];

        if (slot.startTime < delayEndTime) {
            if (firstAffectedSlot === -1) {
                firstAffectedSlot = i;
            }
            // Block this slot
            slot.status = SlotStatus.BLOCKED;
        } else {
            // Slots are in time order, so we can break
            break;
        }
    }

    if (firstAffectedSlot === -1) {
        // No slots affected
        return [];
    }

    // Reallocate tokens from affected slots
    const requeuedTokens = allocationEngine.reallocate(
        doctor.id,
        doctor,
        firstAffectedSlot,
        tokens
    );

    return requeuedTokens;
}
