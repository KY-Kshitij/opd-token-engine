// src/engine/priorityCalculator.ts

import { Token, PatientSource } from '../models/Token';

/**
 * Calculate priority score for a token
 * 
 * Pure function - same input always produces same output
 * 
 * Priority rules (5-tier system):
 * - EMERGENCY: 1000 + time-based tiebreaker (highest - critical cases)
 * - REFERRAL: 500 + time-based tiebreaker (high - paid priority patients)
 * - FOLLOWUP: 300 + time-based tiebreaker (medium-high - continuity of care)
 * - ONLINE: 100 + time-based tiebreaker (medium - pre-booked)
 * - WALKIN: 0 + time-based tiebreaker (lowest - walk-in patients)
 * 
 * Time-based tiebreaker: Use timestamp to ensure FIFO within same source
 * Lower timestamp (earlier request) = higher priority within tier
 * 
 * @param token Token to calculate priority for
 * @returns Priority score (higher = more priority)
 */
export function calculatePriority(token: Token): number {
    let basePriority: number;

    switch (token.source) {
        case PatientSource.EMERGENCY:
            basePriority = 1000;
            break;
        case PatientSource.REFERRAL:
            basePriority = 500;
            break;
        case PatientSource.FOLLOWUP:
            basePriority = 300;
            break;
        case PatientSource.ONLINE:
            basePriority = 100;
            break;
        case PatientSource.WALKIN:
            basePriority = 0;
            break;
    }

    // Tiebreaker: Earlier requests get slightly higher priority within same tier
    // Subtract milliseconds to make earlier timestamps have higher priority
    // Divide by large number to keep tiebreaker small relative to base priority
    const tiebreaker = -token.requestedAt.getTime() / 1000000000;

    return basePriority + tiebreaker;
}
