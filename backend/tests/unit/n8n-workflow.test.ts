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

  describe('008-escalation-email-notification.json', () => {
    const workflowPath = resolve(__dirname, '../../../n8n/workflows/008-escalation-email-notification.json');

    it('should be valid JSON', () => {
      const content = readFileSync(workflowPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should have required nodes', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const nodeNames = workflow.nodes.map((n: { name: string }) => n.name);

      expect(nodeNames).toContain('Manual Trigger');
      expect(nodeNames).toContain('Webhook');
      expect(nodeNames).toContain('Auth Validate');
      expect(nodeNames).toContain('GET OPEN Escalations');
      expect(nodeNames).toContain('Check Escalations Exist');
      expect(nodeNames).toContain('Split Escalations');
      expect(nodeNames).toContain('GET Conversation Context');
      expect(nodeNames).toContain('Format Email');
      expect(nodeNames).toContain('Send Email via SMTP');
      expect(nodeNames).toContain('Pass Escalation ID');
      expect(nodeNames).toContain('PATCH Mark Notified');
      expect(nodeNames).toContain('Output Summary');
    });

    it('should have Webhook trigger with correct config', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const node = workflow.nodes.find((n: { name: string }) => n.name === 'Webhook');

      expect(node).toBeDefined();
      expect(node.type).toBe('n8n-nodes-base.webhook');
      expect(node.parameters.httpMethod).toBe('POST');
      expect(node.parameters.path).toBe('pr008-escalation-email');
      expect(node.parameters.responseMode).toBe('lastNode');
    });

    it('should have Auth Validate Code node before any notification node', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const authNode = workflow.nodes.find((n: { name: string }) => n.name === 'Auth Validate');

      expect(authNode).toBeDefined();
      expect(authNode.type).toBe('n8n-nodes-base.code');
      expect(authNode.parameters.jsCode).toContain("headers['x-api-key']");
      expect(authNode.parameters.jsCode).toContain('$env.INTERNAL_API_KEY');
      expect(authNode.parameters.jsCode).toContain('UNAUTHORIZED');
      expect(authNode.parameters.language).toBe('javaScript');

      // Auth Validate must connect to GET OPEN Escalations
      expect(workflow.connections['Auth Validate']).toBeDefined();
      expect(workflow.connections['Auth Validate'].main[0][0].node).toBe('GET OPEN Escalations');

      // Webhook must connect to Auth Validate (not directly to any notification/HTTP node)
      expect(workflow.connections['Webhook']).toBeDefined();
      expect(workflow.connections['Webhook'].main[0][0].node).toBe('Auth Validate');
    });

    it('should validate X-API-Key before any backend or email call', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const authNode = workflow.nodes.find((n: { name: string }) => n.name === 'Auth Validate');

      // The Auth Validate code must check the header against the env var
      const code = authNode.parameters.jsCode;
      expect(code).toContain('x-api-key');
      expect(code).toContain('INTERNAL_API_KEY');

      // Must throw on missing key (no bypass when headers are absent)
      expect(code).toContain('Missing X-API-Key');
      // Must throw on wrong key
      expect(code).toContain('Invalid X-API-Key');
    });

    it('should use GET /api/v1/escalations?status=OPEN', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const node = workflow.nodes.find((n: { name: string }) => n.name === 'GET OPEN Escalations');
      expect(node.parameters.url).toContain('BACKEND_URL');
      expect(node.parameters.url).toContain('/api/v1/escalations?status=OPEN');
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

    it('should have Format Email Code node that produces subject and bodyHtml', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const node = workflow.nodes.find((n: { name: string }) => n.name === 'Format Email');

      expect(node).toBeDefined();
      expect(node.type).toBe('n8n-nodes-base.code');
      expect(node.parameters.language).toBe('javaScript');

      const code = node.parameters.jsCode;
      expect(code).toContain('subject');
      expect(code).toContain('bodyHtml');
      expect(code).toContain('<h2>');
      expect(code).toContain('Escalamiento');
      expect(code).toContain('KamiKaze Bikes');
    });

    it('should have Send Email via SMTP HTTP Request node calling backend endpoint', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const node = workflow.nodes.find((n: { name: string }) => n.name === 'Send Email via SMTP');

      expect(node).toBeDefined();
      expect(node.type).toBe('n8n-nodes-base.httpRequest');
      expect(node.parameters.method).toBe('POST');
      expect(node.parameters.url).toContain('/api/v1/internal/send-email');
    });

    it('should NOT continue on email send failure', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const node = workflow.nodes.find((n: { name: string }) => n.name === 'Send Email via SMTP');

      // continueOnFail must be false — failed email must block PATCH Mark Notified
      expect(node.continueOnFail).not.toBe(true);
    });

    it('should have PATCH Mark Notified after Pass Escalation ID (which follows email)', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      const passNode = workflow.nodes.find((n: { name: string }) => n.name === 'Pass Escalation ID');

      expect(workflow.connections['Pass Escalation ID']).toBeDefined();
      expect(workflow.connections['Pass Escalation ID'].main[0][0].node).toBe('PATCH Mark Notified');
    });

    it('should not contain hardcoded SMTP credentials or email addresses', () => {
      const content = readFileSync(workflowPath, 'utf-8');
      // SMTP is handled by backend, not n8n — should not have SMTP env refs in workflow
      expect(content).not.toContain('devmateodmnz@gmail.com');
      expect(content).not.toContain('smtp.gmail.com');
      // n8n workflow delegates email to backend endpoint
      expect(content).toContain('/api/v1/internal/send-email');
    });

    it('should not contain Discord references', () => {
      const content = readFileSync(workflowPath, 'utf-8');
      expect(content).not.toContain('discord');
      expect(content).not.toContain('DISCORD_WEBHOOK_URL');
      expect(content).not.toContain('Discord');
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

      // Manual Trigger → GET OPEN Escalations
      expect(workflow.connections['Manual Trigger']).toBeDefined();
      expect(workflow.connections['Manual Trigger'].main[0][0].node).toBe('GET OPEN Escalations');

      // Webhook → Auth Validate
      expect(workflow.connections['Webhook']).toBeDefined();
      expect(workflow.connections['Webhook'].main[0][0].node).toBe('Auth Validate');

      // Auth Validate → GET OPEN Escalations
      expect(workflow.connections['Auth Validate']).toBeDefined();
      expect(workflow.connections['Auth Validate'].main[0][0].node).toBe('GET OPEN Escalations');

      // GET OPEN Escalations → Check Escalations Exist
      expect(workflow.connections['GET OPEN Escalations']).toBeDefined();

      // Check Escalations Exist → Split Escalations (true branch)
      expect(workflow.connections['Check Escalations Exist']).toBeDefined();
      expect(workflow.connections['Check Escalations Exist'].main[0][0].node).toBe('Split Escalations');

      // Split Escalations → GET Conversation Context
      expect(workflow.connections['Split Escalations']).toBeDefined();
      expect(workflow.connections['Split Escalations'].main[0][0].node).toBe('GET Conversation Context');

      // GET Conversation Context → Format Email
      expect(workflow.connections['GET Conversation Context']).toBeDefined();
      expect(workflow.connections['GET Conversation Context'].main[0][0].node).toBe('Format Email');

      // Format Email → Send Email via SMTP
      expect(workflow.connections['Format Email']).toBeDefined();
      expect(workflow.connections['Format Email'].main[0][0].node).toBe('Send Email via SMTP');

      // Send Email via SMTP → Pass Escalation ID
      expect(workflow.connections['Send Email via SMTP']).toBeDefined();
      expect(workflow.connections['Send Email via SMTP'].main[0][0].node).toBe('Pass Escalation ID');

      // Pass Escalation ID → PATCH Mark Notified
      expect(workflow.connections['Pass Escalation ID']).toBeDefined();
      expect(workflow.connections['Pass Escalation ID'].main[0][0].node).toBe('PATCH Mark Notified');

      // PATCH Mark Notified → Output Summary
      expect(workflow.connections['PATCH Mark Notified']).toBeDefined();
      expect(workflow.connections['PATCH Mark Notified'].main[0][0].node).toBe('Output Summary');
    });

    it('should include X-API-Key header in HTTP calls', () => {
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));

      const getEscalations = workflow.nodes.find((n: { name: string }) => n.name === 'GET OPEN Escalations');
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

    it('should not contain hardcoded webhook URLs', () => {
      const content = readFileSync(workflowPath, 'utf-8');
      // Must not contain hardcoded localhost:5678 webhook paths
      expect(content).not.toContain('localhost:5678/webhook');
    });
  });
});
