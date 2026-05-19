import {
  getRememberedPickupPoints,
  rememberPickupPoint,
  rememberPickupPoints,
} from './pickupPointsMemory';
import type { PickupPoint } from '@/services/api/logisticsService';

function createPickupPoint(id: number, name: string): PickupPoint {
  return {
    id,
    name,
    city: 'Bogota',
    address: `Address ${id}`,
    eventId: 1,
  };
}

describe('pickupPointsMemory', () => {
  beforeEach(() => {
    rememberPickupPoints([]);
  });

  it('stores and sorts pickup points by descending id', () => {
    rememberPickupPoints([createPickupPoint(1, 'A'), createPickupPoint(3, 'C')]);
    rememberPickupPoint(createPickupPoint(2, 'B'));

    const result = getRememberedPickupPoints();

    expect(result.map((item) => item.id)).toEqual([3, 2, 1]);
  });

  it('upserts pickup points by id', () => {
    rememberPickupPoint(createPickupPoint(1, 'Old'));
    rememberPickupPoint(createPickupPoint(1, 'Updated'));

    const result = getRememberedPickupPoints();

    expect(result.find((item) => item.id === 1)?.name).toBe('Updated');
  });
});
