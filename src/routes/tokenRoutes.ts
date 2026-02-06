// src/routes/tokenRoutes.ts

import { Router, Request, Response } from 'express';
import { Token, TokenStatus, PatientSource } from '../models/Token';
import { Doctor } from '../models/Doctor';
import { AllocationEngine } from '../engine/allocationEngine';
import { QueueManager } from '../engine/queueManager';
import { calculatePriority } from '../engine/priorityCalculator';
import { handleCancellation } from '../events/cancellationHandler';
import { handleNoShow } from '../events/noShowHandler';
import { handleEmergency } from '../events/emergencyHandler';

/**
 * Token routes - HTTP mapping only
 * Business logic delegated to engine/events
 */
export function createTokenRoutes(
    tokens: Map<string, Token>,
    doctors: Map<string, Doctor>,
    queueManager: QueueManager,
    allocationEngine: AllocationEngine
): Router {
    const router = Router();

    /**
     * Request a new token
     * POST /tokens/request
     * Body: { patientName, patientAge, source, doctorId }
     */
    router.post('/request', (req: Request, res: Response) => {
        const { patientName, patientAge, source, doctorId } = req.body;

        // Validate input
        if (!patientName || !patientAge || !source || !doctorId) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const doctor = doctors.get(doctorId);
        if (!doctor) {
            res.status(404).json({ error: 'Doctor not found' });
            return;
        }

        // Create token
        const token: Token = {
            id: `TOK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            patientName,
            patientAge,
            source: source as PatientSource,
            status: TokenStatus.REQUESTED,
            doctorId: null,
            slotIndex: null,
            priorityScore: 0,
            requestedAt: new Date(),
            allocatedAt: null,
            completedAt: null
        };

        // Handle emergency separately
        if (source === PatientSource.EMERGENCY) {
            const allocated = handleEmergency(token, doctor, queueManager, allocationEngine);
            tokens.set(token.id, token);

            res.json({
                token,
                message: allocated ? 'Emergency token allocated immediately' : 'Emergency token queued (no immediate capacity)'
            });
            return;
        }

        // Calculate priority and add to queue
        token.priorityScore = calculatePriority(token);
        token.status = TokenStatus.QUEUED;
        token.doctorId = doctorId;
        queueManager.enqueue(doctorId, token);

        // Try to allocate from queue
        allocationEngine.allocateFromQueue(doctorId, doctor);

        tokens.set(token.id, token);

        res.json({ token });
    });

    /**
     * Cancel a token
     * POST /tokens/cancel/:id
     */
    router.post('/cancel/:id', (req: Request, res: Response) => {
        const token = tokens.get(req.params.id);
        if (!token) {
            res.status(404).json({ error: 'Token not found' });
            return;
        }

        if (token.status === TokenStatus.QUEUED) {
            // Remove from queue
            if (token.doctorId) {
                queueManager.remove(token.doctorId, token.id);
            }
            token.status = TokenStatus.CANCELLED;
            token.completedAt = new Date();

            res.json({ token, message: 'Token cancelled from queue' });
            return;
        }

        if (token.status !== TokenStatus.ALLOCATED) {
            res.status(400).json({ error: `Cannot cancel token with status ${token.status}` });
            return;
        }

        const doctor = doctors.get(token.doctorId!);
        if (!doctor) {
            res.status(404).json({ error: 'Doctor not found' });
            return;
        }

        handleCancellation(token, doctor, allocationEngine);

        res.json({ token, message: 'Token cancelled and slot freed' });
    });

    /**
     * Mark token as no-show
     * POST /tokens/no-show/:id
     */
    router.post('/no-show/:id', (req: Request, res: Response) => {
        const token = tokens.get(req.params.id);
        if (!token) {
            res.status(404).json({ error: 'Token not found' });
            return;
        }

        if (token.status !== TokenStatus.ALLOCATED) {
            res.status(400).json({ error: `Cannot mark no-show for token with status ${token.status}` });
            return;
        }

        const doctor = doctors.get(token.doctorId!);
        if (!doctor) {
            res.status(404).json({ error: 'Doctor not found' });
            return;
        }

        handleNoShow(token, doctor, allocationEngine);

        res.json({ token, message: 'Token marked as no-show and slot freed' });
    });

    /**
     * Complete a token
     * POST /tokens/complete/:id
     */
    router.post('/complete/:id', (req: Request, res: Response) => {
        const token = tokens.get(req.params.id);
        if (!token) {
            res.status(404).json({ error: 'Token not found' });
            return;
        }

        if (token.status !== TokenStatus.ALLOCATED) {
            res.status(400).json({ error: `Cannot complete token with status ${token.status}` });
            return;
        }

        const doctor = doctors.get(token.doctorId!);
        if (!doctor) {
            res.status(404).json({ error: 'Doctor not found' });
            return;
        }

        // Free from slot and mark complete
        allocationEngine.freeTokenFromSlot(token, doctor);
        token.status = TokenStatus.COMPLETED;
        token.completedAt = new Date();

        // Try to fill freed slot
        allocationEngine.allocateFromQueue(doctor.id, doctor);

        res.json({ token, message: 'Token completed' });
    });

    /**
     * Get token status
     * GET /tokens/:id
     */
    router.get('/:id', (req: Request, res: Response) => {
        const token = tokens.get(req.params.id);
        if (!token) {
            res.status(404).json({ error: 'Token not found' });
            return;
        }

        res.json({ token });
    });

    return router;
}
