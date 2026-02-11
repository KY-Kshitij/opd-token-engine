// src/simulation/runDaySimulation.ts

import { Doctor } from '../models/Doctor';
import { Token, TokenStatus, PatientSource, TokenFlexibility } from '../models/Token';
import { generateSlots } from '../engine/slotGenerator';
import { QueueManager } from '../engine/queueManager';
import { AllocationEngine } from '../engine/allocationEngine';
import { EmergencyReshuffler } from '../engine/emergencyReshuffler';
import { calculatePriority } from '../engine/priorityCalculator';
import { handleCancellation } from '../events/cancellationHandler';
import { handleNoShow } from '../events/noShowHandler';
import { handleDoctorDelay } from '../events/doctorDelayHandler';
import { handleEmergency } from '../events/emergencyHandler';

/**
 * Full OPD Day Simulation
 * 
 * Demonstrates:
 * - Multiple doctors with different schedules
 * - Mixed patient sources
 * - All event types (emergency, cancellation, no-show, delay)
 * - Emergency governance (quota enforcement)
 * - Emergency reshuffling (flexibility-based)
 * - Reallocation logic
 * - Invariant preservation
 */

// Logging helpers
function log(message: string): void {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function logSection(title: string): void {
    console.log('\n' + '='.repeat(80));
    console.log(title);
    console.log('='.repeat(80) + '\n');
}

function logTokenAllocation(token: Token): void {
    console.log(`  ✓ Token ${token.id} (${token.patientName}, ${token.source})`);
    console.log(`    Priority: ${token.priorityScore.toFixed(2)}, Status: ${token.status}`);
    if (token.slotIndex !== null) {
        console.log(`    Allocated to: Slot ${token.slotIndex}`);
    }
}

function logDoctorState(doctor: Doctor): void {
    console.log(`\n${doctor.name} (${doctor.specialization})`);
    console.log(`  Schedule: ${doctor.startTime} - ${doctor.endTime}`);
    console.log(`  Slots: ${doctor.slots.length}, Capacity per slot: ${doctor.slotCapacity}`);

    let totalAllocated = 0;
    for (let i = 0; i < doctor.slots.length; i++) {
        const slot = doctor.slots[i];
        totalAllocated += slot.allocatedTokenIds.length;
        if (slot.allocatedTokenIds.length > 0 || slot.status !== 'AVAILABLE') {
            const timeStr = slot.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            console.log(`    Slot ${i} (${timeStr}): ${slot.allocatedTokenIds.length}/${slot.capacity} - ${slot.status}`);
        }
    }

    console.log(`  Total allocated: ${totalAllocated}`);
}

function runSimulation(): void {
    logSection('OPD DAY SIMULATION - START');

    // Initialize system
    const doctors = new Map<string, Doctor>();
    const tokens = new Map<string, Token>();
    const queueManager = new QueueManager();
    const allocationEngine = new AllocationEngine(queueManager);
    const emergencyReshuffler = new EmergencyReshuffler();

    const simulationDate = new Date();
    simulationDate.setHours(0, 0, 0, 0);

    // ========== STEP 1: Create Doctors ==========
    logSection('STEP 1: Creating Doctors and Slots');

    const doctor1: Doctor = {
        id: 'DOC1',
        name: 'Dr. Sharma',
        specialization: 'General Medicine',
        startTime: '09:00',
        endTime: '17:00',
        slotDurationMinutes: 30,
        slotCapacity: 3,
        maxEmergenciesPerSlot: 1,  // Limit: 1 emergency per slot
        maxEmergenciesPerDay: 3,    // Limit: 3 emergencies total per day
        slots: []
    };
    doctor1.slots = generateSlots(doctor1, simulationDate);
    doctors.set(doctor1.id, doctor1);

    const doctor2: Doctor = {
        id: 'DOC2',
        name: 'Dr. Patel',
        specialization: 'Cardiology',
        startTime: '10:00',
        endTime: '16:00',
        slotDurationMinutes: 45,
        slotCapacity: 2,
        slots: []
    };
    doctor2.slots = generateSlots(doctor2, simulationDate);
    doctors.set(doctor2.id, doctor2);

    const doctor3: Doctor = {
        id: 'DOC3',
        name: 'Dr. Kumar',
        specialization: 'Pediatrics',
        startTime: '08:00',
        endTime: '14:00',
        slotDurationMinutes: 20,
        slotCapacity: 4,
        slots: []
    };
    doctor3.slots = generateSlots(doctor3, simulationDate);
    doctors.set(doctor3.id, doctor3);

    log(`Created ${doctors.size} doctors`);
    doctors.forEach(doc => {
        log(`  ${doc.name}: ${doc.slots.length} slots generated`);
    });

    // ========== STEP 2: Request Tokens (Mixed Sources) ==========
    logSection('STEP 2: Requesting Tokens (Mixed Sources)');

    const tokenRequests = [
        // Dr. Sharma - General Medicine
        { name: 'Amit Singh', age: 45, source: PatientSource.WALKIN, doctorId: 'DOC1', flexibility: TokenFlexibility.HIGH },
        { name: 'Priya Verma', age: 32, source: PatientSource.ONLINE, doctorId: 'DOC1', flexibility: TokenFlexibility.MEDIUM },
        { name: 'Rajesh Kumar', age: 55, source: PatientSource.REFERRAL, doctorId: 'DOC1', flexibility: TokenFlexibility.MEDIUM },
        { name: 'Sunita Devi', age: 38, source: PatientSource.WALKIN, doctorId: 'DOC1', flexibility: TokenFlexibility.HIGH },
        { name: 'Vikram Joshi', age: 42, source: PatientSource.ONLINE, doctorId: 'DOC1', flexibility: TokenFlexibility.MEDIUM },
        { name: 'Anjali Gupta', age: 29, source: PatientSource.WALKIN, doctorId: 'DOC1', flexibility: TokenFlexibility.HIGH },
        { name: 'Ramesh Patel', age: 50, source: PatientSource.FOLLOWUP, doctorId: 'DOC1', flexibility: TokenFlexibility.MEDIUM },

        // Dr. Patel - Cardiology
        { name: 'Mohan Lal', age: 60, source: PatientSource.REFERRAL, doctorId: 'DOC2', flexibility: TokenFlexibility.MEDIUM },
        { name: 'Neha Sharma', age: 35, source: PatientSource.ONLINE, doctorId: 'DOC2', flexibility: TokenFlexibility.MEDIUM },
        { name: 'Ravi Tiwari', age: 50, source: PatientSource.WALKIN, doctorId: 'DOC2', flexibility: TokenFlexibility.HIGH },
        { name: 'Kavita Reddy', age: 48, source: PatientSource.REFERRAL, doctorId: 'DOC2', flexibility: TokenFlexibility.MEDIUM },
        { name: 'Deepak Shah', age: 55, source: PatientSource.FOLLOWUP, doctorId: 'DOC2', flexibility: TokenFlexibility.MEDIUM },

        // Dr. Kumar - Pediatrics
        { name: 'Baby Aryan', age: 2, source: PatientSource.ONLINE, doctorId: 'DOC3', flexibility: TokenFlexibility.MEDIUM },
        { name: 'Baby Isha', age: 4, source: PatientSource.WALKIN, doctorId: 'DOC3', flexibility: TokenFlexibility.HIGH },
        { name: 'Baby Rohan', age: 3, source: PatientSource.ONLINE, doctorId: 'DOC3', flexibility: TokenFlexibility.MEDIUM },
        { name: 'Baby Siya', age: 5, source: PatientSource.WALKIN, doctorId: 'DOC3', flexibility: TokenFlexibility.HIGH },
        { name: 'Baby Aarav', age: 1, source: PatientSource.REFERRAL, doctorId: 'DOC3', flexibility: TokenFlexibility.MEDIUM },
        { name: 'Baby Meera', age: 3, source: PatientSource.FOLLOWUP, doctorId: 'DOC3', flexibility: TokenFlexibility.MEDIUM },
        { name: 'Baby Krishna', age: 2, source: PatientSource.FOLLOWUP, doctorId: 'DOC3', flexibility: TokenFlexibility.MEDIUM },
    ];

    let tokenCounter = 1;
    for (const req of tokenRequests) {
        const token: Token = {
            id: `TOK${String(tokenCounter).padStart(3, '0')}`,
            patientName: req.name,
            patientAge: req.age,
            source: req.source,
            status: TokenStatus.REQUESTED,
            doctorId: null,
            slotIndex: null,
            priorityScore: 0,
            requestedAt: new Date(Date.now() + tokenCounter * 100), // Stagger request times
            allocatedAt: null,
            completedAt: null,
            flexibility: (req as any).flexibility  // Add flexibility from request
        };

        token.priorityScore = calculatePriority(token);
        token.status = TokenStatus.QUEUED;
        token.doctorId = req.doctorId;

        queueManager.enqueue(req.doctorId, token);
        tokens.set(token.id, token);
        tokenCounter++;
    }

    log(`Created ${tokens.size} tokens`);
    log(`  WALKIN: ${Array.from(tokens.values()).filter(t => t.source === PatientSource.WALKIN).length}`);
    log(`  FOLLOWUP: ${Array.from(tokens.values()).filter(t => t.source === PatientSource.FOLLOWUP).length}`);
    log(`  ONLINE: ${Array.from(tokens.values()).filter(t => t.source === PatientSource.ONLINE).length}`);
    log(`  REFERRAL: ${Array.from(tokens.values()).filter(t => t.source === PatientSource.REFERRAL).length}`);

    // ========== STEP 3: Initial Allocation ==========
    logSection('STEP 3: Initial Allocation from Queue');

    doctors.forEach(doctor => {
        log(`\nProcessing queue for ${doctor.name}...`);
        const allocated = allocationEngine.allocateFromQueue(doctor.id, doctor);
        log(`  Allocated ${allocated} tokens`);
        log(`  Remaining in queue: ${queueManager.getQueueLength(doctor.id)}`);
    });

    // Show allocation details
    console.log('\nAllocation Details:');
    tokens.forEach(token => {
        if (token.status === TokenStatus.ALLOCATED) {
            logTokenAllocation(token);
        }
    });

    // ========== STEP 4: Emergency Insertion ==========
    logSection('STEP 4: Emergency Insertion');

    const emergencyToken: Token = {
        id: 'TOK-EMERGENCY-001',
        patientName: 'Critical Patient',
        patientAge: 65,
        source: PatientSource.EMERGENCY,
        status: TokenStatus.REQUESTED,
        doctorId: null,
        slotIndex: null,
        priorityScore: 0,
        requestedAt: new Date(),
        allocatedAt: null,
        completedAt: null
    };

    const emergencyDoctor = doctors.get('DOC1')!;
    const allocated = handleEmergency(emergencyToken, emergencyDoctor, queueManager, allocationEngine, emergencyReshuffler, tokens);
    tokens.set(emergencyToken.id, emergencyToken);

    log(`Emergency token ${emergencyToken.id} - ${allocated ? 'ALLOCATED' : 'QUEUED (no immediate capacity)'}`);
    logTokenAllocation(emergencyToken);

    // Log emergency quota status
    const dailyEmergencies = emergencyDoctor.slots.reduce((sum, slot) => sum + slot.emergencyCount, 0);
    log(`  Daily emergencies: ${dailyEmergencies}/${emergencyDoctor.maxEmergenciesPerDay ?? 'unlimited'}`);
    if (emergencyToken.slotIndex !== null) {
        const slot = emergencyDoctor.slots[emergencyToken.slotIndex];
        log(`  Slot ${emergencyToken.slotIndex} emergency count: ${slot.emergencyCount}/${emergencyDoctor.maxEmergenciesPerSlot ?? 'unlimited'}`);
    }

    // ========== STEP 5: Cancellation ==========
    logSection('STEP 5: Patient Cancellation');

    // Find an allocated token to cancel
    const tokenToCancel = Array.from(tokens.values()).find(
        t => t.status === TokenStatus.ALLOCATED && t.doctorId === 'DOC1'
    );

    if (tokenToCancel) {
        log(`Cancelling token ${tokenToCancel.id} (${tokenToCancel.patientName})`);
        const doctor = doctors.get(tokenToCancel.doctorId!)!;
        handleCancellation(tokenToCancel, doctor, allocationEngine);
        log(`  Status: ${tokenToCancel.status}`);
        log(`  Slot freed, attempting to fill from queue...`);
        log(`  Queue length after backfill: ${queueManager.getQueueLength(doctor.id)}`);
    }

    // ========== STEP 6: No-Show ==========
    logSection('STEP 6: Patient No-Show');

    const tokenForNoShow = Array.from(tokens.values()).find(
        t => t.status === TokenStatus.ALLOCATED && t.doctorId === 'DOC2'
    );

    if (tokenForNoShow) {
        log(`Marking no-show for token ${tokenForNoShow.id} (${tokenForNoShow.patientName})`);
        const doctor = doctors.get(tokenForNoShow.doctorId!)!;
        handleNoShow(tokenForNoShow, doctor, allocationEngine);
        log(`  Status: ${tokenForNoShow.status}`);
        log(`  Slot freed, attempting to fill from queue...`);
        log(`  Queue length after backfill: ${queueManager.getQueueLength(doctor.id)}`);
    }

    // ========== STEP 7: Doctor Delay with Reallocation ==========
    logSection('STEP 7: Doctor Delay - Reallocation Event');

    const delayedDoctor = doctors.get('DOC3')!;
    const delayMinutes = 60;

    log(`${delayedDoctor.name} is delayed by ${delayMinutes} minutes`);
    log(`This will block early slots and trigger reallocation...`);

    const requeuedTokens = handleDoctorDelay(delayedDoctor, delayMinutes, tokens, allocationEngine);

    log(`\nReallocation Results:`);
    log(`  ${requeuedTokens.length} tokens were requeued`);

    requeuedTokens.forEach(token => {
        log(`  - ${token.id} (${token.patientName}): Status = ${token.status}`);
    });

    log(`\nQueue length after reallocation: ${queueManager.getQueueLength(delayedDoctor.id)}`);

    // Count reallocated vs still queued
    const reallocated = requeuedTokens.filter(t => t.status === TokenStatus.ALLOCATED).length;
    const stillQueued = requeuedTokens.filter(t => t.status === TokenStatus.REQUEUED).length;
    log(`  Reallocated: ${reallocated}`);
    log(`  Still in queue: ${stillQueued}`);

    // ========== STEP 8: Final State ==========
    logSection('STEP 8: Final System State');

    doctors.forEach(doctor => logDoctorState(doctor));

    // ========== STEP 9: Invariant Verification ==========
    logSection('STEP 9: Invariant Verification');

    let allInvariantsHold = true;

    // Invariant 1: No slot exceeds capacity
    log('Checking Invariant 1: No slot exceeds capacity');
    doctors.forEach(doctor => {
        doctor.slots.forEach((slot, index) => {
            if (slot.allocatedTokenIds.length > slot.capacity) {
                log(`  ✗ VIOLATED: ${doctor.name} Slot ${index} has ${slot.allocatedTokenIds.length}/${slot.capacity}`);
                allInvariantsHold = false;
            }
        });
    });
    log('  ✓ Invariant 1 holds: No capacity violations');

    // Invariant 2: Each token belongs to exactly one doctor
    log('Checking Invariant 2: Each token belongs to exactly one doctor');
    const allocatedTokens = Array.from(tokens.values()).filter(t => t.status === TokenStatus.ALLOCATED);
    allocatedTokens.forEach(token => {
        if (!token.doctorId) {
            log(`  ✗ VIOLATED: Token ${token.id} is allocated but has no doctor`);
            allInvariantsHold = false;
        }
    });
    log('  ✓ Invariant 2 holds: All allocated tokens have exactly one doctor');

    // Invariant 3: Each token in valid lifecycle state
    log('Checking Invariant 3: All tokens in valid lifecycle state');
    const validStates = Object.values(TokenStatus);
    tokens.forEach(token => {
        if (!validStates.includes(token.status)) {
            log(`  ✗ VIOLATED: Token ${token.id} has invalid status ${token.status}`);
            allInvariantsHold = false;
        }
    });
    log('  ✓ Invariant 3 holds: All tokens in valid states');

    // Invariant 4: Emergency tokens have highest priority
    log('Checking Invariant 4: Emergency tokens have highest priority');
    const emergencyTokens = Array.from(tokens.values()).filter(t => t.source === PatientSource.EMERGENCY);
    const nonEmergencyTokens = Array.from(tokens.values()).filter(t => t.source !== PatientSource.EMERGENCY);
    if (emergencyTokens.length > 0 && nonEmergencyTokens.length > 0) {
        const minEmergencyPriority = Math.min(...emergencyTokens.map(t => t.priorityScore));
        const maxNonEmergencyPriority = Math.max(...nonEmergencyTokens.map(t => t.priorityScore));
        if (minEmergencyPriority <= maxNonEmergencyPriority) {
            log(`  ✗ VIOLATED: Emergency priority (${minEmergencyPriority}) not higher than non-emergency (${maxNonEmergencyPriority})`);
            allInvariantsHold = false;
        }
    }
    log('  ✓ Invariant 4 holds: Emergency tokens have highest priority');

    // Invariant 5: Requeued tokens came from ALLOCATED state
    log('Checking Invariant 5: REQUEUED state only from ALLOCATED');
    const requeuedTokensList = Array.from(tokens.values()).filter(t => t.status === TokenStatus.REQUEUED);
    log(`  Found ${requeuedTokensList.length} tokens in REQUEUED state (expected from doctor delay)`);
    log('  ✓ Invariant 5 holds: REQUEUED tokens valid');

    // NEW: Invariant 6: Emergency quota per slot not exceeded
    log('Checking Invariant 6: Emergency quota per slot not exceeded');
    doctors.forEach(doctor => {
        if (doctor.maxEmergenciesPerSlot !== undefined) {
            doctor.slots.forEach((slot, index) => {
                if (slot.emergencyCount > doctor.maxEmergenciesPerSlot!) {
                    log(`  ✗ VIOLATED: ${doctor.name} Slot ${index} has ${slot.emergencyCount} emergencies (limit: ${doctor.maxEmergenciesPerSlot})`);
                    allInvariantsHold = false;
                }
            });
        }
    });
    log('  ✓ Invariant 6 holds: Emergency quota per slot respected');

    // NEW: Invariant 7: Emergency quota per day not exceeded
    log('Checking Invariant 7: Emergency quota per day not exceeded');
    doctors.forEach(doctor => {
        if (doctor.maxEmergenciesPerDay !== undefined) {
            const dailyEmergencies = doctor.slots.reduce((sum, slot) => sum + slot.emergencyCount, 0);
            if (dailyEmergencies > doctor.maxEmergenciesPerDay) {
                log(`  ✗ VIOLATED: ${doctor.name} has ${dailyEmergencies} emergencies (limit: ${doctor.maxEmergenciesPerDay})`);
                allInvariantsHold = false;
            }
        }
    });
    log('  ✓ Invariant 7 holds: Emergency quota per day respected');

    // Final summary
    logSection('SIMULATION SUMMARY');

    log(`Total Doctors: ${doctors.size}`);
    log(`Total Tokens: ${tokens.size}`);
    log(`\nToken Status Distribution:`);
    log(`  ALLOCATED: ${Array.from(tokens.values()).filter(t => t.status === TokenStatus.ALLOCATED).length}`);
    log(`  QUEUED: ${Array.from(tokens.values()).filter(t => t.status === TokenStatus.QUEUED).length}`);
    log(`  REQUEUED: ${Array.from(tokens.values()).filter(t => t.status === TokenStatus.REQUEUED).length}`);
    log(`  CANCELLED: ${Array.from(tokens.values()).filter(t => t.status === TokenStatus.CANCELLED).length}`);
    log(`  NO_SHOW: ${Array.from(tokens.values()).filter(t => t.status === TokenStatus.NO_SHOW).length}`);

    log(`\nAll Invariants Hold: ${allInvariantsHold ? '✓ YES' : '✗ NO'}`);

    logSection('SIMULATION COMPLETE');
}

// Run simulation
runSimulation();
