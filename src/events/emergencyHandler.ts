// src/events/emergencyHandler.ts

import { Token, PatientSource, TokenStatus } from '../models/Token';
import { Doctor } from '../models/Doctor';
import { SlotStatus } from '../models/Slot';
import { AllocationEngine } from '../engine/allocationEngine';
import { calculatePriority } from '../engine/priorityCalculator';
import { QueueManager } from '../engine/queueManager';
import { EmergencyReshuffler } from '../engine/emergencyReshuffler';

/**
 * Handle emergency token insertion with quota governance and reshuffling
 * 
 * Emergency tokens get highest priority but DO NOT evict existing allocations
 * They respect both capacity and emergency quota constraints
 * 
 * State transition: REQUESTED → QUEUED → ALLOCATED (if capacity/quota available)
 * 
 * Invariants preserved:
 * - Capacity never exceeded
 * - Emergency quota per slot respected
 * - Emergency quota per day respected
 * 
 * @param token Emergency token to handle
 * @param doctor Doctor to assign to
 * @param queueManager Queue manager
 * @param allocationEngine Allocation engine
 * @param reshuffler Emergency reshuffler (optional - for backward compatibility)
 * @param tokens All tokens map (optional - for reshuffling)
 * @returns True if allocated immediately, false if queued
 */
export function handleEmergency(
    token: Token,
    doctor: Doctor,
    queueManager: QueueManager,
    _allocationEngine: AllocationEngine,  // Kept for backward compatibility, not used
    reshuffler?: EmergencyReshuffler,
    tokens?: Map<string, Token>
): boolean {
    // Validate token is emergency
    if (token.source !== PatientSource.EMERGENCY) {
        throw new Error(`Token ${token.id} is not an emergency token`);
    }

    // Calculate priority (should be highest)
    token.priorityScore = calculatePriority(token);

    // Check daily emergency limit (if configured)
    if (doctor.maxEmergenciesPerDay !== undefined) {
        const dailyEmergencies = countDailyEmergencies(doctor);
        if (dailyEmergencies >= doctor.maxEmergenciesPerDay) {
            // Daily quota exceeded - queue with high priority
            token.status = TokenStatus.QUEUED;
            token.doctorId = doctor.id;
            queueManager.enqueue(doctor.id, token);
            return false;
        }
    }

    // Try immediate allocation with quota check
    const slotIndex = allocateWithQuotaCheck(token, doctor);

    if (slotIndex !== null) {
        // Successfully allocated
        doctor.slots[slotIndex].emergencyCount++;
        return true;
    }

    // No immediate capacity - try reshuffling if available
    if (reshuffler && tokens) {
        const reshuffledSlot = reshuffler.attemptReshuffle(doctor, token, tokens);
        if (reshuffledSlot !== null) {
            // Reshuffling succeeded - increment emergency counter
            doctor.slots[reshuffledSlot].emergencyCount++;
            return true;
        }
    }

    // No immediate capacity and reshuffling failed or unavailable
    // Add to queue with highest priority
    token.status = TokenStatus.QUEUED;
    token.doctorId = doctor.id;
    queueManager.enqueue(doctor.id, token);

    return false;
}

/**
 * Allocate emergency token with per-slot quota checking
 * 
 * @param token Token to allocate
 * @param doctor Doctor to allocate to
 * @returns Slot index if allocated, null otherwise
 */
function allocateWithQuotaCheck(token: Token, doctor: Doctor): number | null {
    const maxEmergenciesPerSlot = doctor.maxEmergenciesPerSlot ?? 1; // Default: 1

    // Find first available slot with capacity AND emergency quota
    for (let i = 0; i < doctor.slots.length; i++) {
        const slot = doctor.slots[i];

        // Slot must be:
        // 1. Not blocked
        // 2. Have capacity for more tokens
        // 3. Not exceed emergency quota
        if (
            slot.status !== SlotStatus.BLOCKED &&
            slot.allocatedTokenIds.length < slot.capacity &&
            slot.emergencyCount < maxEmergenciesPerSlot
        ) {
            // Allocate token to this slot
            slot.allocatedTokenIds.push(token.id);

            // Update slot status if now full
            if (slot.allocatedTokenIds.length === slot.capacity) {
                slot.status = SlotStatus.FULL;
            }

            // Update token state
            token.status = TokenStatus.ALLOCATED;
            token.doctorId = doctor.id;
            token.slotIndex = i;
            token.allocatedAt = new Date();

            return i;
        }
    }

    // No available slot found
    return null;
}

/**
 * Count total emergency tokens allocated across all slots for the day
 * 
 * @param doctor Doctor to count emergencies for
 * @returns Total emergency count
 */
function countDailyEmergencies(doctor: Doctor): number {
    return doctor.slots.reduce((sum, slot) => sum + slot.emergencyCount, 0);
}

