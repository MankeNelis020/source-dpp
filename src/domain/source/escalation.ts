import type { EscalationPolicy, EscalationStep } from "./types";

export const STANDARD_SUPPLIER_14D: EscalationPolicy = {
  id: "standard_supplier_14d",
  name: "Standard supplier 14 days",
  version: "1.0",
  steps: [
    { day: 0, action: "send", label: "Send request" },
    { day: 3, action: "friendly_reminder", label: "Friendly reminder" },
    { day: 7, action: "reminder_due", label: "Reminder + due date" },
    { day: 10, action: "secondary_contact", label: "Try secondary contact" },
    { day: 14, action: "escalate_procurement", label: "Escalate to procurement owner" },
    { day: 21, action: "mark_non_responsive", label: "Mark supplier non-responsive" },
  ],
};

export const RENEWAL_POLICY_STEPS = [
  { daysBefore: 90, action: "informational" },
  { daysBefore: 60, action: "request_replacement" },
  { daysBefore: 30, action: "reminder" },
  { daysBefore: 7, action: "escalate" },
  { daysBefore: 0, action: "expired" },
] as const;

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function dueStep(policy: EscalationPolicy, sentAt: Date, now: Date): EscalationStep | undefined {
  const elapsed = daysBetween(sentAt, now);
  const due = policy.steps.filter((step) => step.day <= elapsed);
  return due.at(-1);
}

export function nextPendingStep(
  policy: EscalationPolicy,
  sentAt: Date,
  now: Date,
  executed: string[]
): EscalationStep | undefined {
  const elapsed = daysBetween(sentAt, now);
  return policy.steps.find((step) => step.day <= elapsed && !executed.includes(step.action));
}

export function upcomingStep(
  policy: EscalationPolicy,
  sentAt: Date,
  now: Date,
  executed: string[]
): EscalationStep | undefined {
  const elapsed = daysBetween(sentAt, now);
  return policy.steps.find((step) => step.day > elapsed && !executed.includes(step.action));
}

export function reminderAlreadySent(executed: string[], action: string): boolean {
  return executed.includes(action);
}
