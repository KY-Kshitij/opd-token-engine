// src/engine/emergencyReshuffler.ts

import { Doctor } from '../models/Doctor';
import { Token, TokenFlexibility, TokenStatus } from '../models/Token';
import { SlotStatus } from '../models/Slot';

/**
 * Emergency Reshuffler - Attempts to free capacity for emergencies
 * by shifting flexible tokens to nearby slots
 * 
 * Constraints:
 * - Only shifts tokens within localized window (+/- 2 slots)
 * - Prefers shifting HIGH flexibility tokens (WALKIN)
 * - Shifts minimum required tokens (one at a time)
 * - Never triggers global rebalancing
 * 
 * This preserves the system's core principle: localized operations only
 */
export class EmergencyReshuffler {
    /**
     * Attempt to reshuffle tokens to make room for emergency
     * 
     * Algorithm:
     * 1. Find first slot where emergency could fit (has capacity or can be freed)
     * 2. If slot is full, identify most flexible token in that slot
     * 3. Try to shift that token to a nearby slot (+/- 2 positions) with capacity
     * 4. If shift succeeds, allocate emergency to freed space
     * 5. Return slot index if successful, null otherwise
     * 
     * @param doctor Doctor to allocate emergency to
     * @param emergencyToken Emergency token to allocate
     * @param tokens Map of all tokens for lookup
     * @returns Slot index if reshuffling succeeded, null otherwise
     */
    attemptReshuffle(
        doctor: Doctor,
        emergencyToken: Token,
        tokens: Map<string, Token>
    ): number | null {
        const RESHUFFLE_WINDOW = 2; // Look +/- 2 slots

        // Find first non-blocked slot (may be full)
        for (let targetSlotIndex = 0; targetSlotIndex < doctor.slots.length; targetSlotIndex++) {
            const targetSlot = doctor.slots[targetSlotIndex];

            // Skip blocked slots
            if (targetSlot.status === SlotStatus.BLOCKED) {
                continue;
            }

            // If slot has capacity, we can allocate directly (shouldn't happen, but handle it)
            if (targetSlot.allocatedTokenIds.length < targetSlot.capacity) {
                // This slot has space - emergency handler should have caught this
                // but allocate here anyway
                return this.allocateEmergencyToSlot(emergencyToken, doctor, targetSlotIndex);
            }

            // Slot is full - try to find flexible token to shift
            const flexibleToken = this.findMostFlexibleToken(targetSlot, tokens);
            if (!flexibleToken) {
                // No flexible tokens in this slot, try next slot
                continue;
            }

            // Try to find nearby slot to shift the flexible token to
            const destinationSlot = this.findNearbySlotWithCapacity(
                doctor,
                targetSlotIndex,
                RESHUFFLE_WINDOW
            );

            if (destinationSlot === null) {
                // No nearby capacity, try next slot
                continue;
            }

            // Perform the shift: free token from current slot, move to destination
            this.shiftToken(flexibleToken, doctor, targetSlotIndex, destinationSlot);

            // Now allocate emergency to the freed space
            return this.allocateEmergencyToSlot(emergencyToken, doctor, targetSlotIndex);
        }

        // Could not reshuffle - no suitable slots found
        return null;
    }

    /**
     * Find the most flexible token in a slot
     * Prefers: HIGH > MEDIUM > LOW > undefined
     * 
     * @param slot Slot to search
     * @param tokens All tokens map
     * @returns Most flexible token or null
     */
    private findMostFlexibleToken(
        slot: { allocatedTokenIds: string[] },
        tokens: Map<string, Token>
    ): Token | null {
        let mostFlexible: Token | null = null;
        let highestFlexibility = -1;

        for (const tokenId of slot.allocatedTokenIds) {
            const token = tokens.get(tokenId);
            if (!token) continue;

            // Map flexibility to numeric value (higher = more flexible)
            let flexScore = 0; // Default for undefined flexibility
            if (token.flexibility === TokenFlexibility.HIGH) {
                flexScore = 3;
            } else if (token.flexibility === TokenFlexibility.MEDIUM) {
                flexScore = 2;
            } else if (token.flexibility === TokenFlexibility.LOW) {
                flexScore = 1;
            }

            if (flexScore > highestFlexibility) {
                highestFlexibility = flexScore;
                mostFlexible = token;
            }
        }

        return mostFlexible;
    }

    /**
     * Find nearby slot with available capacity
     * Searches within +/- window from current slot
     * 
     * @param doctor Doctor whose slots to search
     * @param currentSlotIndex Current slot index
     * @param window How many slots to look ahead/behind
     * @returns Slot index with capacity or null
     */
    private findNearbySlotWithCapacity(
        doctor: Doctor,
        currentSlotIndex: number,
        window: number
    ): number | null {
        const minSlot = Math.max(0, currentSlotIndex - window);
        const maxSlot = Math.min(doctor.slots.length - 1, currentSlotIndex + window);

        // Search forward first (prefer later slots)
        for (let i = currentSlotIndex + 1; i <= maxSlot; i++) {
            const slot = doctor.slots[i];
            if (
                slot.status === SlotStatus.AVAILABLE &&
                slot.allocatedTokenIds.length < slot.capacity
            ) {
                return i;
            }
        }

        // Then search backward
        for (let i = currentSlotIndex - 1; i >= minSlot; i--) {
            const slot = doctor.slots[i];
            if (
                slot.status === SlotStatus.AVAILABLE &&
                slot.allocatedTokenIds.length < slot.capacity
            ) {
                return i;
            }
        }

        return null;
    }

    /**
     * Shift a token from one slot to another
     * 
     * @param token Token to shift
     * @param doctor Doctor
     * @param fromSlotIndex Source slot index
     * @param toSlotIndex Destination slot index
     */
    private shiftToken(
        token: Token,
        doctor: Doctor,
        fromSlotIndex: number,
        toSlotIndex: number
    ): void {
        const fromSlot = doctor.slots[fromSlotIndex];
        const toSlot = doctor.slots[toSlotIndex];

        // Remove from source slot
        const index = fromSlot.allocatedTokenIds.indexOf(token.id);
        if (index !== -1) {
            fromSlot.allocatedTokenIds.splice(index, 1);

            // Update source slot status if it was full
            if (fromSlot.status === SlotStatus.FULL && fromSlot.allocatedTokenIds.length < fromSlot.capacity) {
                fromSlot.status = SlotStatus.AVAILABLE;
            }
        }

        // Add to destination slot
        toSlot.allocatedTokenIds.push(token.id);

        // Update destination slot status if now full
        if (toSlot.allocatedTokenIds.length === toSlot.capacity) {
            toSlot.status = SlotStatus.FULL;
        }

        // Update token slot index
        token.slotIndex = toSlotIndex;
        token.allocatedAt = new Date(); // Update allocation time
    }

    /**
     * Allocate emergency token to a specific slot
     * 
     * @param emergencyToken Emergency token to allocate
     * @param doctor Doctor
     * @param slotIndex Target slot index
     * @returns Slot index if successful, null if failed
     */
    private allocateEmergencyToSlot(
        emergencyToken: Token,
        doctor: Doctor,
        slotIndex: number
    ): number | null {
        const slot = doctor.slots[slotIndex];

        // Verify slot has capacity
        if (slot.allocatedTokenIds.length >= slot.capacity) {
            return null;
        }

        // Allocate token to slot
        slot.allocatedTokenIds.push(emergencyToken.id);

        // Update slot status if now full
        if (slot.allocatedTokenIds.length === slot.capacity) {
            slot.status = SlotStatus.FULL;
        }

        // Update token state
        emergencyToken.status = TokenStatus.ALLOCATED;
        emergencyToken.doctorId = doctor.id;
        emergencyToken.slotIndex = slotIndex;
        emergencyToken.allocatedAt = new Date();

        return slotIndex;
    }
}
