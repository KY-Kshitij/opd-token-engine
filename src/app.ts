// src/app.ts

import express from 'express';
import { Doctor } from './models/Doctor';
import { Token } from './models/Token';
import { QueueManager } from './engine/queueManager';
import { AllocationEngine } from './engine/allocationEngine';
import { createTokenRoutes } from './routes/tokenRoutes';
import { createDoctorRoutes } from './routes/doctorRoutes';

/**
 * Express application setup
 * 
 * In-memory data stores:
 * - doctors: All doctor configurations and their slots
 * - tokens: All patient tokens
 * - queueManager: Priority queues for each doctor
 * - allocationEngine: Core allocation logic
 */

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());

// In-memory data stores
export const doctors = new Map<string, Doctor>();
export const tokens = new Map<string, Token>();
export const queueManager = new QueueManager();
export const allocationEngine = new AllocationEngine(queueManager);

// Routes
app.use('/tokens', createTokenRoutes(tokens, doctors, queueManager, allocationEngine));
app.use('/doctors', createDoctorRoutes(doctors, tokens, queueManager, allocationEngine));

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        doctors: doctors.size,
        tokens: tokens.size
    });
});

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
});

// Start server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`OPD Token Engine running on port ${PORT}`);
    });
}

export { app };
