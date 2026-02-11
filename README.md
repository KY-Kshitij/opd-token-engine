# OPD Token Allocation Engine

![Node.js](https://img.shields.io/badge/Node.js-18.x-green)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)
![Architecture](https://img.shields.io/badge/Architecture-Domain--First-purple)
![Status](https://img.shields.io/badge/Status-Assignment--Ready-success)


Backend-only core for allocating patient tokens to doctor time slots with real-time event handling.

## Features

- **Strict Capacity Management**: Slots never exceed capacity
- **Priority-Based Allocation**: EMERGENCY > REFERRAL > FOLLOWUP > ONLINE > WALKIN
- **Multiple Token Sources**: Online booking, Walk-in, Paid Priority (Referral), Follow-up
- **Event Handling**: Cancellations, no-shows, doctor delays, emergencies
- **Dynamic Reallocation**: Tokens reallocated when doctors are delayed
- **Explicit State Machine**: All token state transitions are traceable
- **Doctor-Scoped Operations**: No full-system scans

## Tech Stack

- Node.js
- TypeScript (strict mode)
- Express
- In-memory data structures

## Project Structure

```
src/
├── models/           # Data structures (Token, Slot, Doctor)
├── engine/           # Pure business logic
│   ├── slotGenerator.ts
│   ├── priorityCalculator.ts
│   ├── queueManager.ts
│   └── allocationEngine.ts
├── events/           # State transition handlers
│   ├── cancellationHandler.ts
│   ├── noShowHandler.ts
│   ├── doctorDelayHandler.ts
│   └── emergencyHandler.ts
├── routes/           # HTTP API endpoints
│   ├── tokenRoutes.ts
│   └── doctorRoutes.ts
├── simulation/       # Full-day OPD simulation
│   └── runDaySimulation.ts
└── app.ts           # Express application

ORCHESTRATION.md     # System architecture
TASK_FLOW.md         # Operational guide
```

## Getting Started

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run Simulation

```bash
npm run simulation
```

This runs a full OPD day with:
- 3 doctors (different specializations and schedules)
- 19+ patient tokens (all 4 sources: Online, Walk-in, Referral, Follow-up)
- 1 emergency event
- 1 cancellation
- 1 no-show
- 1 doctor delay with reallocation

### Start Server

```bash
npm run dev    # Development
npm start      # Production
```

Server runs on `http://localhost:3000`

## API Endpoints

### Token Routes

- `POST /tokens/request` - Request new token
- `POST /tokens/cancel/:id` - Cancel token
- `POST /tokens/no-show/:id` - Mark no-show
- `POST /tokens/complete/:id` - Complete consultation
- `GET /tokens/:id` - Get token status

### Doctor Routes

- `POST /doctors` - Add doctor
- `GET /doctors/:id/slots` - View doctor's slots
- `POST /doctors/:id/delay` - Handle doctor delay
- `GET /doctors/:id/queue` - View doctor's queue

### Health Check

- `GET /health` - Service health status

## Core Invariants

The system maintains these invariants at all times:

1. **Capacity Constraint**: No slot exceeds its capacity
2. **Token Ownership**: Each token belongs to exactly one doctor
3. **Valid States**: Tokens are always in valid lifecycle states
4. **Emergency Priority**: Emergency tokens have highest priority
5. **Priority Preservation**: Reallocation maintains relative priority ordering

## Token Lifecycle

```
REQUESTED → QUEUED → ALLOCATED → COMPLETED
                    ↓
                    CANCELLED / NO_SHOW
                    ↓
                    REQUEUED (doctor delay only)
```

## Priority System

- **EMERGENCY**: 1000+ (highest - critical cases)
- **REFERRAL**: 500-999 (high - paid priority patients)
- **FOLLOWUP**: 300-499 (medium-high - continuity of care)
- **ONLINE**: 100-299 (medium - pre-booked appointments)
- **WALKIN**: 0-99 (lowest - walk-in patients)

Within each tier, earlier requests have higher priority (FIFO).

## Documentation

- **[ORCHESTRATION.md](./ORCHESTRATION.md)** - System architecture and component responsibilities
- **[TASK_FLOW.md](./TASK_FLOW.md)** - Operational flow and debugging guide

## Design Principles

1. **Determinism**: Same input → same output
2. **Explicit State Transitions**: All state changes are intentional
3. **Clear Invariants**: Capacity and lifecycle constraints enforced
4. **Debuggability**: Traced execution, clear error messages
5. **Separation of Concerns**: Models → Engine → Events → Routes

## Performance

- **Queue Operations**: O(n) insertion, O(1) dequeue
- **Allocation**: Scoped to one doctor (no global scan)
- **Reallocation**: Localized to affected slots only

## Future Extensions (Not Implemented)

- Database persistence
- Authentication/authorization
- Real-time notifications
- Background job processing
- Multi-tenancy
- Observability/monitoring

## License

ISC

---

**Built with strict TypeScript, clean architecture, and maintainability in mind.**
