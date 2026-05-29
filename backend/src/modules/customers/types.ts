/**
 * Customers Types
 */

export interface CustomerResponse {
  id: string;
  phone: string;
  name: string | null;
  optedOut: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
}
