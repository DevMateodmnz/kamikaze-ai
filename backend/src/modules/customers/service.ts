/**
 * Customers Service
 *
 * Handles customer identification and management via Prisma.
 */

import { prisma } from '../../config/database.js';
import type { CustomerResponse } from './types.js';

/**
 * Normalize phone number to E.164 format
 */
export function normalizePhone(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.trim();

  // If starts with 0, replace with +54 (Argentina)
  if (normalized.startsWith('0')) {
    normalized = '+54' + normalized.slice(1);
  }

  // If doesn't start with +, add +
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }

  // Remove any spaces or dashes
  normalized = normalized.replace(/[\s-]/g, '');

  return normalized;
}

/**
 * Validate phone number format (basic E.164 validation)
 */
export function isValidPhone(phone: string): boolean {
  // Basic E.164 format: +[country code][number]
  // Argentina: +54 9 [area code] [number]
  const e164Regex = /^\+\d{1,3}\d{6,14}$/;
  return e164Regex.test(phone);
}

/**
 * Identify customer by phone number (get or create)
 *
 * - Normalizes phone to E.164 format
 * - Gets existing Customer by phone or creates new one
 * - Updates lastSeenAt when getting existing customer
 */
export async function identifyCustomer(phone: string): Promise<CustomerResponse> {
  const normalizedPhone = normalizePhone(phone);

  if (!isValidPhone(normalizedPhone)) {
    throw new Error(`Invalid phone number format: ${phone}`);
  }

  // Try to find existing customer
  const existing = await prisma.customer.findUnique({
    where: { phone: normalizedPhone },
  });

  if (existing) {
    // Update lastSeenAt
    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
    });
    return customerToResponse(updated);
  }

  // Create new customer
  const created = await prisma.customer.create({
    data: {
      phone: normalizedPhone,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  return customerToResponse(created);
}

/**
 * Get customer by ID
 */
export async function getCustomerById(customerId: string): Promise<CustomerResponse | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer) {
    return null;
  }

  return customerToResponse(customer);
}

/**
 * Update customer name
 */
export async function updateCustomerName(customerId: string, name: string): Promise<void> {
  await prisma.customer.update({
    where: { id: customerId },
    data: { name },
  });
}

/**
 * Update customer metadata
 */
export async function updateCustomerMetadata(
  customerId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await prisma.customer.update({
    where: { id: customerId },
    data: { metadata: JSON.parse(JSON.stringify(metadata)) as Parameters<typeof prisma.customer.update>[0]['data']['metadata'] },
  });
}

/**
 * Opt out customer from data retention
 */
export async function optOutCustomer(customerId: string): Promise<void> {
  await prisma.customer.update({
    where: { id: customerId },
    data: { optedOut: true },
  });
}

/**
 * Convert Prisma Customer to CustomerResponse
 */
function customerToResponse(customer: {
  id: string;
  phone: string;
  name: string | null;
  optedOut: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
}): CustomerResponse {
  return {
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
    optedOut: customer.optedOut,
    firstSeenAt: customer.firstSeenAt,
    lastSeenAt: customer.lastSeenAt,
  };
}

// Export as singleton service object
export const customersService = {
  identifyCustomer,
  getCustomerById,
  updateCustomerName,
  updateCustomerMetadata,
  optOutCustomer,
};
