import type { PickupPoint } from '@/services/api/logisticsService';

let memory: PickupPoint[] = [];

function upsert(items: PickupPoint[]) {
  const byId = new Map<number, PickupPoint>();

  memory.forEach((item) => {
    byId.set(item.id, item);
  });

  items.forEach((item) => {
    byId.set(item.id, item);
  });

  memory = Array.from(byId.values()).sort((a, b) => b.id - a.id);
}

export function rememberPickupPoints(items: PickupPoint[]) {
  upsert(items);
}

export function rememberPickupPoint(item: PickupPoint) {
  upsert([item]);
}

export function getRememberedPickupPoints() {
  return memory;
}
