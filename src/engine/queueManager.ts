// src/engine/queueManager.ts

import { Token } from '../models/Token';

/**
 * Queue manager for handling priority-based token queues
 * 
 * Maintains tokens in priority order (highest first)
 * Scoped to one doctor at a time
 * 
 * Performance:
 * - enqueue: O(n) insertion to maintain sorted order
 * - dequeue: O(1) removal from front
 * - remove: O(n) search and removal
 * 
 * Why not re-sort every time: Avoids O(n log n) on every operation
 */
export class QueueManager {
    private queues: Map<string, Token[]>;

    constructor() {
        this.queues = new Map();
    }

    /**
     * Add token to doctor's queue, maintaining priority order
     * 
     * @param doctorId Doctor ID
     * @param token Token to enqueue
     */
    enqueue(doctorId: string, token: Token): void {
        if (!this.queues.has(doctorId)) {
            this.queues.set(doctorId, []);
        }

        const queue = this.queues.get(doctorId)!;

        // Find insertion point to maintain descending priority order
        let insertIndex = queue.length;
        for (let i = 0; i < queue.length; i++) {
            if (token.priorityScore > queue[i].priorityScore) {
                insertIndex = i;
                break;
            }
        }

        // Insert at correct position
        queue.splice(insertIndex, 0, token);
    }

    /**
     * Remove and return highest priority token from queue
     * 
     * @param doctorId Doctor ID
     * @returns Highest priority token or null if queue empty
     */
    dequeue(doctorId: string): Token | null {
        const queue = this.queues.get(doctorId);
        if (!queue || queue.length === 0) {
            return null;
        }

        // Remove from front (highest priority)
        return queue.shift()!;
    }

    /**
     * Remove specific token from queue (for cancellations)
     * 
     * @param doctorId Doctor ID
     * @param tokenId Token ID to remove
     * @returns True if token was found and removed
     */
    remove(doctorId: string, tokenId: string): boolean {
        const queue = this.queues.get(doctorId);
        if (!queue) {
            return false;
        }

        const index = queue.findIndex(t => t.id === tokenId);
        if (index === -1) {
            return false;
        }

        queue.splice(index, 1);
        return true;
    }

    /**
     * Re-add multiple tokens to queue (for reallocation after doctor delay)
     * Maintains priority ordering
     * 
     * @param doctorId Doctor ID
     * @param tokens Tokens to re-queue
     */
    requeue(doctorId: string, tokens: Token[]): void {
        // Enqueue each token individually to maintain priority order
        for (const token of tokens) {
            this.enqueue(doctorId, token);
        }
    }

    /**
     * Get current queue for a doctor (for display/debugging)
     * 
     * @param doctorId Doctor ID
     * @returns Copy of queue array
     */
    getQueue(doctorId: string): Token[] {
        return [...(this.queues.get(doctorId) || [])];
    }

    /**
     * Get queue length
     * 
     * @param doctorId Doctor ID
     * @returns Number of tokens in queue
     */
    getQueueLength(doctorId: string): number {
        return this.queues.get(doctorId)?.length || 0;
    }
}
