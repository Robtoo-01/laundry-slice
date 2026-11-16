// Order statuses and allowed transitions. Pure data and functions: no database, no network.

export const STATUSES = [
  'Requested',
  'Confirmed',
  'Pickup scheduled',
  'Driver assigned',
  'Collected',
  'Received at facility',
  'Processing',
  'Quality check',
  'Ready for delivery',
  'Out for delivery',
  'Delivered',
  'Cancelled',
  'Issue',
] as const;

export type Status = (typeof STATUSES)[number];
export type ActorRole = 'customer' | 'staff' | 'admin' | 'system';

// Slice assumption: there is no driver role yet, so admin stands in for the driver steps.
// Keep in step with the order_transitions table in supabase/migrations (a test compares the two).
export const TRANSITIONS: { from: Status; to: Status; roles: ActorRole[] }[] = [
  { from: 'Requested', to: 'Confirmed', roles: ['system'] },
  { from: 'Confirmed', to: 'Pickup scheduled', roles: ['admin'] },
  { from: 'Pickup scheduled', to: 'Driver assigned', roles: ['admin'] },
  { from: 'Driver assigned', to: 'Collected', roles: ['admin'] },
  { from: 'Collected', to: 'Received at facility', roles: ['staff', 'admin'] },
  { from: 'Received at facility', to: 'Processing', roles: ['staff', 'admin'] },
  { from: 'Processing', to: 'Quality check', roles: ['staff', 'admin'] },
  { from: 'Quality check', to: 'Ready for delivery', roles: ['staff', 'admin'] },
  { from: 'Quality check', to: 'Processing', roles: ['staff', 'admin'] },
  { from: 'Ready for delivery', to: 'Out for delivery', roles: ['admin'] },
  { from: 'Out for delivery', to: 'Delivered', roles: ['admin'] },
];

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string, role: ActorRole): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to && t.roles.includes(role));
}

export function nextStatuses(from: string, role: ActorRole): Status[] {
  return TRANSITIONS.filter((t) => t.from === from && t.roles.includes(role)).map((t) => t.to);
}
