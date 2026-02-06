// src/routes/doctorRoutes.ts

import { Router, Request, Response } from 'express';
import { Doctor } from '../models/Doctor';
import { Token } from '../models/Token';
import { AllocationEngine } from '../engine/allocationEngine';
import { QueueManager } from '../engine/queueManager';
import { generateSlots } from '../engine/slotGenerator';
import { handleDoctorDelay } from '../events/doctorDelayHandler';

/**
 * Doctor routes - HTTP mapping only
 * Business logic delegated to engine/events
 */
export function createDoctorRoutes(
    doctors: Map<string, Doctor>,
    tokens: Map<string, Token>,
    queueManager: QueueManager,
    allocationEngine: AllocationEngine
): Router {
    const router = Router();
    /**
     * Add a new doctor
     * POST /doctors
     * Body: { id, name, specialization, startTime, endTime, slotDurationMinutes, slotCapacity }
     */
    router.post('/', (req: Request, res: Response) => {
        const { id, name, specialization, startTime, endTime, slotDurationMinutes, slotCapacity } = req.body;

        // Validate input
        if (!id || !name || !specialization || !startTime || !endTime || !slotDurationMinutes || !slotCapacity) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        if (doctors.has(id)) {
            res.status(400).json({ error: 'Doctor already exists' });
            return;
        }

        // Create doctor with empty slots initially
        const doctor: Doctor = {
            id,
            name,
            specialization,
            startTime,
            endTime,
            slotDurationMinutes,
            slotCapacity,
            slots: []
        };

        // Generate slots for today
        doctor.slots = generateSlots(doctor, new Date());

        doctors.set(id, doctor);

        res.json({ doctor, slotsGenerated: doctor.slots.length });
    });

    /**
     * Get doctor's slots
     * GET /doctors/:id/slots
     */
    router.get('/:id/slots', (req: Request, res: Response) => {
        const doctor = doctors.get(req.params.id);
        if (!doctor) {
            res.status(404).json({ error: 'Doctor not found' });
            return;
        }

        res.json({ slots: doctor.slots });
    });

    /**
     * Handle doctor delay
     * POST /doctors/:id/delay
     * Body: { delayMinutes }
     */
    router.post('/:id/delay', (req: Request, res: Response) => {
        const doctor = doctors.get(req.params.id);
        if (!doctor) {
            res.status(404).json({ error: 'Doctor not found' });
            return;
        }

        const { delayMinutes } = req.body;
        if (!delayMinutes || delayMinutes <= 0) {
            res.status(400).json({ error: 'Invalid delay minutes' });
            return;
        }

        const requeuedTokens = handleDoctorDelay(doctor, delayMinutes, tokens, allocationEngine);

        res.json({
            message: `Doctor delayed by ${delayMinutes} minutes`,
            requeuedTokens: requeuedTokens.map(t => t.id),
            requeuedCount: requeuedTokens.length
        });
    });

    /**
     * Get doctor's queue
     * GET /doctors/:id/queue
     */
    router.get('/:id/queue', (req: Request, res: Response) => {
        const doctor = doctors.get(req.params.id);
        if (!doctor) {
            res.status(404).json({ error: 'Doctor not found' });
            return;
        }

        const queue = queueManager.getQueue(doctor.id);

        res.json({
            queueLength: queue.length,
            queue: queue.map(t => ({
                id: t.id,
                patientName: t.patientName,
                source: t.source,
                priorityScore: t.priorityScore,
                status: t.status
            }))
        });
    });

    return router;
}
