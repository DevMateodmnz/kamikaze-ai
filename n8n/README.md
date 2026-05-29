# n8n Workflow Exports

This directory contains exported JSON files for n8n workflows.

## Workflows

| File | Purpose | Status |
|------|---------|--------|
| `004b-simulated-message-flow.json` | End-to-end API validation without real WhatsApp or AI | ✅ Implemented |
| `README.md` | This file | ✅ |

## PR-004B: Simulated Message Flow

See [docs/workflows.md](../docs/workflows.md) for detailed documentation.

The simulated workflow validates the full backend API contract:
1. Simulates a WhatsApp-like inbound message (no real WhatsApp)
2. Calls `POST /api/v1/messages/inbound`
3. Creates a deterministic fake bot reply (no AI provider)
4. Calls `POST /api/v1/messages/outbound`
5. Verifies conversation state via `GET /api/v1/conversations/:id`
6. Returns structured summary

## Importing Workflows

1. Open n8n at http://localhost:5678
2. Click "Import from File" (top-right menu)
3. Select the workflow JSON file
4. Configure credentials and variables (see docs/workflows.md)

## Workflow Overview

| File | Purpose | Notes |
|------|---------|-------|
| `004b-simulated-message-flow.json` | API contract validation | Uses localhost backend, no real WhatsApp |

*Full WhatsApp + AI workflow implementation in later phases.*