// src/engine/slotGenerator.ts

import { Doctor } from '../models/Doctor';
import { Slot, SlotStatus } from '../models/Slot';

/**
 * Generate time slots for a doctor's OPD schedule
 * 
 * Pure function - no side effects
 * 
 * @param doctor Doctor configuration
 * @param date Date for which to generate slots
 * @returns Array of slots covering doctor's schedule
 */
export function generateSlots(doctor: Doctor, date: Date): Slot[] {
    const slots: Slot[] = [];

    // Parse start and end times
    const [startHour, startMinute] = doctor.startTime.split(':').map(Number);
    const [endHour, endMinute] = doctor.endTime.split(':').map(Number);

    const currentSlotStart = new Date(date);
    currentSlotStart.setHours(startHour, startMinute, 0, 0);

    const scheduleEnd = new Date(date);
    scheduleEnd.setHours(endHour, endMinute, 0, 0);

    // Generate slots until schedule end
    while (currentSlotStart < scheduleEnd) {
        const slotEnd = new Date(currentSlotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + doctor.slotDurationMinutes);

        // Don't create slot if it extends beyond schedule end
        if (slotEnd > scheduleEnd) {
            break;
        }

        const slot: Slot = {
            startTime: new Date(currentSlotStart),
            endTime: slotEnd,
            capacity: doctor.slotCapacity,
            allocatedTokenIds: [],
            status: SlotStatus.AVAILABLE,
            emergencyCount: 0  // Initialize emergency counter for quota tracking
        };
        slots.push(slot);

        // Move to next slot
        currentSlotStart.setMinutes(
            currentSlotStart.getMinutes() + doctor.slotDurationMinutes
        );
    }

    return slots;
}
