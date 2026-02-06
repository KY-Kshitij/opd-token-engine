// src/engine/allocationEngine.ts

import { Doctor } from '../models/Doctor';
import { SlotStatus } from '../models/Slot';
import { Token, TokenStatus } from '../models/Token';
import { QueueManager } from './queueManager';

/**
 * Core allocation engine - handles token-to-slot assignment
 * 
 * All operations scoped to ONE doctor at a time
 * Enforces capacity invariant: never exceed slot capacity
 * 
 * State mutations are explicit and atomic
 */
export class AllocationEngine {
    private queueManager: QueueManager;

    constructor(queueManager: QueueManager) {
        this.queueManager = queueManager;
    }

    /**
     * Allocate a single token to the first available slot
     * 
     * @param token Token to allocate
     * @param doctor Doctor to allocate to
     * @returns Allocated slot index or null if no capacity
     */
    allocateToken(token: Token, doctor: Doctor): number | null {
        // Find first available slot with capacity
        for (let i = 0; i < doctor.slots.length; i++) {
            const slot = doctor.slots[i];

            // Slot must be available and have capacity
            if (
                slot.status === SlotStatus.AVAILABLE &&
                slot.allocatedTokenIds.length < slot.capacity
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
     * Process entire queue for a doctor
     * Allocate as many tokens as possible from queue to available slots
     * 
     * @param doctorId Doctor ID
     * @param doctor Doctor object
     * @returns Number of tokens allocated
     */
    allocateFromQueue(doctorId: string, doctor: Doctor): number {
        let allocated = 0;

        // Keep allocating until queue empty or no more capacity
        while (true) {
            const token = this.queueManager.dequeue(doctorId);
            if (!token) {
                break; // Queue empty
            }

            const slotIndex = this.allocateToken(token, doctor);
            if (slotIndex === null) {
                // No capacity available, put token back at front of queue
                // Token still has its priority score, will be re-inserted in order
                this.queueManager.enqueue(doctorId, token);
                break;
            }

            allocated++;
        }

        return allocated;
    }

    /**
     * Reallocate tokens from a specific slot onwards
     * Used when doctor is delayed and slots are blocked
     * 
     * Steps:
     * 1. Free all tokens from affected slots
     * 2. Mark tokens as REQUEUED
     * 3. Add tokens back to queue
     * 4. Attempt to allocate to remaining available slots
     * 
     * @param doctorId Doctor ID
     * @param doctor Doctor object
     * @param fromSlotIndex Starting slot index (inclusive)
     * @param tokens All tokens for this doctor (for lookup)
     * @returns Tokens that were requeued
     */
    reallocate(
        doctorId: string,
        doctor: Doctor,
        fromSlotIndex: number,
        tokens: Map<string, Token>
    ): Token[] {
        const requeuedTokens: Token[] = [];

        // Step 1 & 2: Free tokens from affected slots and mark as REQUEUED
        for (let i = fromSlotIndex; i < doctor.slots.length; i++) {
            const slot = doctor.slots[i];

            // Free all tokens from this slot
            for (const tokenId of slot.allocatedTokenIds) {
                const token = tokens.get(tokenId);
                if (token) {
                    // Mark as REQUEUED (only valid transition from ALLOCATED via this path)
                    token.status = TokenStatus.REQUEUED;
                    token.slotIndex = null;
                    token.allocatedAt = null;

                    requeuedTokens.push(token);
                }
            }

            // Clear slot
            slot.allocatedTokenIds = [];
        }

        // Step 3: Add tokens back to queue (maintains priority order)
        this.queueManager.requeue(doctorId, requeuedTokens);

        // Step 4: Try to allocate to remaining available slots
        this.allocateFromQueue(doctorId, doctor);

        return requeuedTokens;
    }

    /**
     * Free a token from its allocated slot
     * Used for cancellations and no-shows
     * 
     * @param token Token to free
     * @param doctor Doctor the token is allocated to
     */
    freeTokenFromSlot(token: Token, doctor: Doctor): void {
        if (token.slotIndex === null) {
            return; // Token not allocated
        }

        const slot = doctor.slots[token.slotIndex];

        // Remove token from slot
        const index = slot.allocatedTokenIds.indexOf(token.id);
        if (index !== -1) {
            slot.allocatedTokenIds.splice(index, 1);

            // Update slot status if it was full
            if (slot.status === SlotStatus.FULL && slot.allocatedTokenIds.length < slot.capacity) {
                slot.status = SlotStatus.AVAILABLE;
            }
        }

        // Clear token allocation info
        token.slotIndex = null;
        token.allocatedAt = null;
    }
}
