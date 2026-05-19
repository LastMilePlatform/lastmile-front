import {
  normalizeCollection,
  buildInventoryMap,
  getErrorMessage,
  formatMoney,
  PHYSICAL_DONATION_OPTIONS,
  type ChatMessage,
  type PhysicalDonationOption,
  type ItemInventoryByCampaign,
  type AuctionMap,
  type ChatMessageCreatedEvent,
  type AuctionRealtimeEvent,
  type InventoryRealtimeEvent,
} from './campaignsShared';

describe('campaignsShared utilities', () => {
  describe('normalizeCollection', () => {
    it('should return array as-is', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const result = normalizeCollection<typeof items[0]>(items);
      expect(result).toEqual(items);
    });

    it('should extract data from paginated response', () => {
      const response = {
        data: [{ id: 1, name: 'item1' }, { id: 2, name: 'item2' }],
        meta: { page: 1, total: 2 },
      };
      const result = normalizeCollection<typeof response.data[0]>(response);
      expect(result).toEqual(response.data);
      expect(result).toHaveLength(2);
    });

    it('should return empty array for null/undefined', () => {
      expect(normalizeCollection(null)).toEqual([]);
      expect(normalizeCollection(undefined)).toEqual([]);
    });

    it('should return empty array for object without data', () => {
      const result = normalizeCollection({ notData: [] });
      expect(result).toEqual([]);
    });

    it('should return empty array for object with non-array data', () => {
      const result = normalizeCollection({ data: 'not an array' });
      expect(result).toEqual([]);
    });

    it('should handle deeply nested paginated responses', () => {
      type NestedCollectionItem = {
        id: number;
        nested: { value: string };
      };

      const response = {
        data: [
          { id: 1, nested: { value: 'a' } },
          { id: 2, nested: { value: 'b' } },
        ],
        meta: { page: 1 },
        extra: { info: 'extra' },
      };
      const result = normalizeCollection<NestedCollectionItem>(response);
      expect(result).toHaveLength(2);
      expect(result[0].nested.value).toBe('a');
    });
  });

  describe('buildInventoryMap', () => {
    it('should aggregate items by campaign', () => {
      const donations = [
        { campaignId: 1, itemType: 'cama', quantity: 5 },
        { campaignId: 1, itemType: 'colchon', quantity: 3 },
        { campaignId: 2, itemType: 'cama', quantity: 2 },
      ];

      const result = buildInventoryMap(donations as never);

      expect(result[1]).toEqual({ cama: 5, colchon: 3 });
      expect(result[2]).toEqual({ cama: 2 });
    });

    it('should accumulate quantities for same item in campaign', () => {
      const donations = [
        { campaignId: 1, itemType: 'cama', quantity: 5 },
        { campaignId: 1, itemType: 'cama', quantity: 3 },
        { campaignId: 1, itemType: 'cama', quantity: 2 },
      ];

      const result = buildInventoryMap(donations as never);

      expect(result[1].cama).toBe(10);
    });

    it('should handle empty array', () => {
      const result = buildInventoryMap([]);
      expect(result).toEqual({});
    });

    it('should handle multiple campaigns with multiple items', () => {
      const donations = [
        { campaignId: 1, itemType: 'cama', quantity: 10 },
        { campaignId: 1, itemType: 'cobija', quantity: 20 },
        { campaignId: 2, itemType: 'alimento', quantity: 100 },
        { campaignId: 3, itemType: 'kit_higiene', quantity: 50 },
      ];

      const result = buildInventoryMap(donations as never);

      expect(Object.keys(result)).toHaveLength(3);
      expect(result[1]).toEqual({ cama: 10, cobija: 20 });
      expect(result[2]).toEqual({ alimento: 100 });
      expect(result[3]).toEqual({ kit_higiene: 50 });
    });
  });

  describe('getErrorMessage', () => {
    it('should return plain error message', () => {
      const error = new Error('Simple error');
      const result = getErrorMessage(error);
      expect(result).toBe('Simple error');
    });

    it('should parse JSON error message', () => {
      const error = new Error(JSON.stringify({ message: 'JSON error message' }));
      const result = getErrorMessage(error);
      expect(result).toBe('JSON error message');
    });

    it('should join array of error messages', () => {
      const error = new Error(JSON.stringify({ message: ['Error 1', 'Error 2', 'Error 3'] }));
      const result = getErrorMessage(error);
      expect(result).toBe('Error 1 | Error 2 | Error 3');
    });

    it('should handle non-Error objects', () => {
      expect(getErrorMessage('string error')).toBe('Error desconocido.');
      expect(getErrorMessage({})).toBe('Error desconocido.');
      expect(getErrorMessage(123)).toBe('Error desconocido.');
    });

    it('should return fallback for empty error message', () => {
      const error = new Error('   ');
      const result = getErrorMessage(error);
      expect(result).toBe('Error desconocido.');
    });

    it('should handle malformed JSON gracefully', () => {
      const error = new Error('{ not valid json');
      const result = getErrorMessage(error);
      expect(result).toBe('{ not valid json');
    });

    it('should return fallback for JSON without message field', () => {
      const error = new Error(JSON.stringify({ error: 'some error' }));
      const result = getErrorMessage(error);
      expect(result).toBe(JSON.stringify({ error: 'some error' }));
    });
  });

  describe('formatMoney', () => {
    it('should format as Colombian currency', () => {
      const result = formatMoney(50000);
      expect(result).toMatch(/\$|COP/);
    });

    it('should handle zero', () => {
      const result = formatMoney(0);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle large numbers', () => {
      const result = formatMoney(1000000);
      expect(result).toBeDefined();
      expect(result.length > 0).toBe(true);
    });

    it('should format fractional amounts correctly', () => {
      const result = formatMoney(12345.67);
      expect(result).toContain('12');
      // Just verify the result is a valid currency string
      expect(typeof result).toBe('string');
      expect(result.length > 0).toBe(true);
    });

    it('should handle large fractional amounts', () => {
      const resultSmall = formatMoney(1000.5);
      const resultLarge = formatMoney(999999.99);
      expect(resultSmall).toBeDefined();
      expect(resultLarge).toBeDefined();
    });
  });

  describe('PHYSICAL_DONATION_OPTIONS', () => {
    it('should contain expected donation options', () => {
      expect(PHYSICAL_DONATION_OPTIONS).toHaveLength(5);
    });

    it('should have all required properties', () => {
      PHYSICAL_DONATION_OPTIONS.forEach((option) => {
        expect(option).toHaveProperty('key');
        expect(option).toHaveProperty('label');
        expect(typeof option.key).toBe('string');
        expect(typeof option.label).toBe('string');
      });
    });

    it('should match expected donation types', () => {
      const keys = PHYSICAL_DONATION_OPTIONS.map((opt) => opt.key);
      expect(keys).toEqual(['cama', 'colchon', 'cobija', 'kit_higiene', 'alimento']);
    });

    it('should have localized Spanish labels', () => {
      expect(PHYSICAL_DONATION_OPTIONS[0].label).toBe('Camas');
      expect(PHYSICAL_DONATION_OPTIONS[1].label).toBe('Colchones');
      expect(PHYSICAL_DONATION_OPTIONS[2].label).toBe('Cobijas');
      expect(PHYSICAL_DONATION_OPTIONS[3].label).toBe('Kits de higiene');
      expect(PHYSICAL_DONATION_OPTIONS[4].label).toBe('Alimentos');
    });
  });

  describe('Type definitions', () => {
    it('should properly type ChatMessage', () => {
      const message: ChatMessage = {
        id: '1',
        author: 'John',
        message: 'Hello',
        createdAt: '2024-01-01T00:00:00Z',
      };
      expect(message).toBeDefined();
    });

    it('should properly type PhysicalDonationOption', () => {
      const option: PhysicalDonationOption = {
        key: 'test',
        label: 'Test Label',
      };
      expect(option).toBeDefined();
    });

    it('should properly type ItemInventoryByCampaign', () => {
      const inventory: ItemInventoryByCampaign = {
        1: { cama: 5, colchon: 3 },
        2: { alimento: 100 },
      };
      expect(inventory[1].cama).toBe(5);
    });

    it('should properly type AuctionMap', () => {
      const auctionMap: AuctionMap = {
        1: [],
        2: [],
      };
      expect(auctionMap[1]).toBeDefined();
    });

    it('should properly type event types', () => {
      const chatEvent: ChatMessageCreatedEvent = {
        id: 1,
        campaignId: 1,
        message: 'test',
      };
      expect(chatEvent.campaignId).toBe(1);

      const auctionEvent: AuctionRealtimeEvent = { campaignId: 1 };
      expect(auctionEvent).toBeDefined();

      const inventoryEvent: InventoryRealtimeEvent = { campaignId: 1 };
      expect(inventoryEvent).toBeDefined();
    });
  });
});
