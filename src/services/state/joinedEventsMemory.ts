import type { EventSummary } from '@/services/api/eventsService';

let memory: EventSummary[] = [];

function upsert(items: EventSummary[]) {
  const byId = new Map<number, EventSummary>();

  memory.forEach((item) => {
    byId.set(item.id, item);
  });

  items.forEach((item) => {
    byId.set(item.id, item);
  });

  memory = Array.from(byId.values()).sort((a, b) => b.id - a.id);
}

export function rememberJoinedEvents(items: EventSummary[]) {
  upsert(items);
}

export function rememberJoinedEvent(item: EventSummary) {
  upsert([item]);
}

export function forgetJoinedEvent(eventId: number) {
  memory = memory.filter((item) => item.id !== eventId);
}

export function getRememberedJoinedEvents() {
  return memory;
}
