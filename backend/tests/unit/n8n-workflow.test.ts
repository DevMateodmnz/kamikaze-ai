/**
 * Tests for n8n Workflow Exports
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('n8n Workflow Exports', () => {
  const workflowPath = resolve(__dirname, '../../../n8n/workflows/004b-simulated-message-flow.json');

  describe('004b-simulated-message-flow.json', () => {
    it('should be valid JSON', () => {
      const content = readFileSync(workflowPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should have required nodes', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const nodeNames = workflow.nodes.map((n: { name: string }) => n.name);

      expect(nodeNames).toContain('Manual Trigger');
      expect(nodeNames).toContain('Create WhatsApp-like Payload');
      expect(nodeNames).toContain('POST /messages/inbound');
      expect(nodeNames).toContain('Create Simulated Reply');
      expect(nodeNames).toContain('POST /messages/outbound');
      expect(nodeNames).toContain('GET /conversations/:id');
      expect(nodeNames).toContain('Output Summary');
    });

    it('should have correct connections', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));

      // Manual Trigger → Create WhatsApp-like Payload
      expect(workflow.connections['Manual Trigger']).toBeDefined();
      expect(workflow.connections['Manual Trigger'].main[0][0].node).toBe('Create WhatsApp-like Payload');

      // Create WhatsApp-like Payload → POST /messages/inbound
      expect(workflow.connections['Create WhatsApp-like Payload']).toBeDefined();
      expect(workflow.connections['Create WhatsApp-like Payload'].main[0][0].node).toBe('POST /messages/inbound');

      // POST /messages/inbound → Create Simulated Reply
      expect(workflow.connections['POST /messages/inbound']).toBeDefined();
      expect(workflow.connections['POST /messages/inbound'].main[0][0].node).toBe('Create Simulated Reply');

      // Create Simulated Reply → POST /messages/outbound
      expect(workflow.connections['Create Simulated Reply']).toBeDefined();
      expect(workflow.connections['Create Simulated Reply'].main[0][0].node).toBe('POST /messages/outbound');

      // POST /messages/outbound → GET /conversations/:id
      expect(workflow.connections['POST /messages/outbound']).toBeDefined();
      expect(workflow.connections['POST /messages/outbound'].main[0][0].node).toBe('GET /conversations/:id');

      // GET /conversations/:id → Output Summary
      expect(workflow.connections['GET /conversations/:id']).toBeDefined();
      expect(workflow.connections['GET /conversations/:id'].main[0][0].node).toBe('Output Summary');
    });

    it('should reference backend endpoints correctly', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));

      const inboundNode = workflow.nodes.find((n: { name: string }) => n.name === 'POST /messages/inbound');
      const outboundNode = workflow.nodes.find((n: { name: string }) => n.name === 'POST /messages/outbound');
      const getConvNode = workflow.nodes.find((n: { name: string }) => n.name === 'GET /conversations/:id');

      // All should reference BACKEND_URL env variable
      expect(inboundNode.parameters.url).toContain('BACKEND_URL');
      expect(inboundNode.parameters.url).toContain('/api/v1/messages/inbound');

      expect(outboundNode.parameters.url).toContain('BACKEND_URL');
      expect(outboundNode.parameters.url).toContain('/api/v1/messages/outbound');

      expect(getConvNode.parameters.url).toContain('BACKEND_URL');
      expect(getConvNode.parameters.url).toContain('/api/v1/conversations/');
    });

    it('should not contain real credentials', () => {
      const content = readFileSync(workflowPath, 'utf-8');
      const workflow = JSON.parse(content);

      // Check no hardcoded API keys
      expect(content).not.toContain('change_me_to_a_secure_random_key');
      expect(content).not.toContain('sk-');
      expect(content).not.toContain('AIza');

      // Check simulated reply is clearly fake
      const replyNode = workflow.nodes.find((n: { name: string }) => n.name === 'Create Simulated Reply');
      expect(replyNode.parameters.assignments.assignments.find((a: { name: string }) => a.name === 'aiProvider').value).toBe('simulated');
      expect(replyNode.parameters.assignments.assignments.find((a: { name: string }) => a.name === 'tokensUsed').value).toBe(0);
    });

    it('should have simulation markers in output', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));

      const outputNode = workflow.nodes.find((n: { name: string }) => n.name === 'Output Summary');
      const assignments = outputNode.parameters.assignments.assignments;

      const simulatedFlag = assignments.find((a: { name: string }) => a.name === 'simulated');
      const noteField = assignments.find((a: { name: string }) => a.name === 'note');

      expect(simulatedFlag.value).toBe(true);
      expect(noteField.value).toContain('simulated');
      expect(noteField.value).toContain('no AI provider was called');
    });

    it('should use POST method for message endpoints', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));

      const inboundNode = workflow.nodes.find((n: { name: string }) => n.name === 'POST /messages/inbound');
      const outboundNode = workflow.nodes.find((n: { name: string }) => n.name === 'POST /messages/outbound');

      expect(inboundNode.parameters.method).toBe('POST');
      expect(outboundNode.parameters.method).toBe('POST');
    });

    it('should use GET method for conversation endpoint', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));

      const getConvNode = workflow.nodes.find((n: { name: string }) => n.name === 'GET /conversations/:id');
      expect(getConvNode.parameters.method).toBe('GET');
    });
  });

  describe('008-escalation-discord-notification.json', () => {
    const workflowPath = resolve(__dirname, '../../../n8n/workflows/008-escalation-discord-notification.json');

    it('should be valid JSON', () => {
      const content = readFileSync(workflowPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should have required nodes', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const nodeNames = workflow.nodes.map((n: { name: string }) => n.name);

      expect(nodeNames).toContain('Manual Trigger');
      expect(nodeNames).toContain('GET Active Escalations');
      expect(nodeNames).toContain('Check Escalations Exist');
      expect(nodeNames).toContain('For Each Escalation');
      expect(nodeNames).toContain('GET Conversation Context');
      expect(nodeNames).toContain('Format Discord Message');
      expect(nodeNames).toContain('POST Discord Webhook');
      expect(nodeNames).toContain('PATCH Mark Notified');
      expect(nodeNames).toContain('Output Summary');
    });

    it('should use GET /api/v1/escalations/active', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const node = workflow.nodes.find((n: { name: string }) => n.name === 'GET Active Escalations');
      expect(node.parameters.url).toContain('BACKEND_URL');
      expect(node.parameters.url).toContain('/api/v1/escalations/active');
      expect(node.parameters.method).toBe('GET');
    });

    it('should use PATCH /escalations/:id/notify', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const node = workflow.nodes.find((n: { name: string }) => n.name === 'PATCH Mark Notified');
      expect(node.parameters.url).toContain('BACKEND_URL');
      expect(node.parameters.url).toContain('/escalations/');
      expect(node.parameters.url).toContain('/notify');
      expect(node.parameters.method).toBe('PATCH');
    });

    it('should use Discord webhook via environment variable', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const node = workflow.nodes.find((n: { name: string }) => n.name === 'POST Discord Webhook');
      expect(node.parameters.url).toContain('DISCORD_WEBHOOK_URL');
    });

    it('should not contain hardcoded Discord webhook URL', () => {
      const content = readFileSync(workflowPath, 'utf-8');
      // Should use env variable placeholder, not real URL
      expect(content).not.toContain('discord.com/api/webhooks/');
      expect(content).not.toContain('https://discord');
      // Should reference env variable
      expect(content).toContain('$env.DISCORD_WEBHOOK_URL');
    });

    it('should not contain real credentials', () => {
      const content = readFileSync(workflowPath, 'utf-8');

      expect(content).not.toContain('change_me_to_a_secure_random_key');
      expect(content).not.toContain('sk-');
      expect(content).not.toContain('AIza');
      expect(content).not.toContain('minimax');
      expect(content).not.toContain('OPENAI_API_KEY');
    });

    it('should only target escalation endpoints (no WhatsApp nodes)', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const nodeTypes = workflow.nodes.map((n: { type: string }) => n.type);

      // Should NOT have WhatsApp Cloud API nodes
      expect(nodeTypes).not.toContain('n8n-nodes-base.whatsApp');
      expect(nodeTypes).not.toContain('@n8n-io/n8n-nodes-whatsapp');

      // Should NOT have AI provider nodes
      expect(nodeTypes).not.toContain('n8n-nodes-base.openAi');
      expect(nodeTypes).not.toContain('n8n-nodes-base.minimax');
    });

    it('should have correct connection flow', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));

      // Manual Trigger → GET Active Escalations
      expect(workflow.connections['Manual Trigger']).toBeDefined();
      expect(workflow.connections['Manual Trigger'].main[0][0].node).toBe('GET Active Escalations');

      // GET Active Escalations → Check Escalations Exist
      expect(workflow.connections['GET Active Escalations']).toBeDefined();

      // Check Escalations Exist → For Each Escalation (true branch)
      expect(workflow.connections['Check Escalations Exist']).toBeDefined();
      expect(workflow.connections['Check Escalations Exist'].main[0][0].node).toBe('For Each Escalation');

      // For Each Escalation → GET Conversation Context
      expect(workflow.connections['For Each Escalation']).toBeDefined();
      expect(workflow.connections['For Each Escalation'].main[0][0].node).toBe('GET Conversation Context');

      // GET Conversation Context → Format Discord Message
      expect(workflow.connections['GET Conversation Context']).toBeDefined();
      expect(workflow.connections['GET Conversation Context'].main[0][0].node).toBe('Format Discord Message');

      // Format Discord Message → POST Discord Webhook
      expect(workflow.connections['Format Discord Message']).toBeDefined();
      expect(workflow.connections['Format Discord Message'].main[0][0].node).toBe('POST Discord Webhook');

      // POST Discord Webhook → PATCH Mark Notified
      expect(workflow.connections['POST Discord Webhook']).toBeDefined();
      expect(workflow.connections['POST Discord Webhook'].main[0][0].node).toBe('PATCH Mark Notified');

      // PATCH Mark Notified → back to For Each Escalation (loop)
      expect(workflow.connections['PATCH Mark Notified']).toBeDefined();
    });

    it('should include X-API-Key header in HTTP calls', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));

      const getEscalations = workflow.nodes.find((n: { name: string }) => n.name === 'GET Active Escalations');
      const getConversation = workflow.nodes.find((n: { name: string }) => n.name === 'GET Conversation Context');
      const patchNotify = workflow.nodes.find((n: { name: string }) => n.name === 'PATCH Mark Notified');

      // All should use X-API-Key header
      const headerParams = getEscalations.parameters.headerParameters?.parameters || [];
      const hasApiKey = headerParams.some((p: { name: string }) => p.name === 'X-API-Key');
      expect(hasApiKey).toBe(true);

      // Other nodes should also use X-API-Key
      expect(getConversation.parameters.headerParameters?.parameters).toBeDefined();
      expect(patchNotify.parameters.headerParameters?.parameters).toBeDefined();
    });
  });
});