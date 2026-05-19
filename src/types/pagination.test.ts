import type { PaginationMeta, PaginatedResponse } from './pagination';

describe('pagination types', () => {
  describe('PaginationMeta', () => {
    it('should have all required fields', () => {
      const meta: PaginationMeta = {
        total: 100,
        page: 1,
        limit: 10,
        totalPages: 10,
      };

      expect(meta).toHaveProperty('total');
      expect(meta).toHaveProperty('page');
      expect(meta).toHaveProperty('limit');
      expect(meta).toHaveProperty('totalPages');
    });

    it('should calculate totalPages correctly', () => {
      const meta: PaginationMeta = {
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
      };

      expect(Math.ceil(meta.total / meta.limit)).toBe(meta.totalPages);
    });

    it('should handle edge cases', () => {
      // Empty result
      const emptyMeta: PaginationMeta = {
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };
      expect(emptyMeta.total).toBe(0);
      expect(emptyMeta.totalPages).toBe(0);

      // Single page
      const singlePageMeta: PaginationMeta = {
        total: 5,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      expect(singlePageMeta.totalPages).toBe(1);
    });

    it('should support different numeric values', () => {
      const meta: PaginationMeta = {
        total: 1000,
        page: 5,
        limit: 50,
        totalPages: 20,
      };

      expect(meta.total).toBe(1000);
      expect(meta.page).toBe(5);
      expect(meta.limit).toBe(50);
      expect(meta.totalPages).toBe(20);
    });
  });

  describe('PaginatedResponse', () => {
    it('should wrap generic data with metadata', () => {
      interface User {
        id: number;
        name: string;
      }

      const response: PaginatedResponse<User> = {
        data: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        meta: {
          total: 100,
          page: 1,
          limit: 10,
          totalPages: 10,
        },
      };

      expect(response.data).toHaveLength(2);
      expect(response.data[0].name).toBe('Alice');
      expect(response.meta.total).toBe(100);
    });

    it('should support empty data arrays', () => {
      interface Product {
        id: number;
        title: string;
      }

      const response: PaginatedResponse<Product> = {
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      };

      expect(response.data).toHaveLength(0);
      expect(response.meta.total).toBe(0);
    });

    it('should maintain type safety for nested objects', () => {
      interface Campaign {
        id: number;
        title: string;
        status: 'active' | 'completed';
      }

      const response: PaginatedResponse<Campaign> = {
        data: [
          { id: 1, title: 'Campaign 1', status: 'active' },
          { id: 2, title: 'Campaign 2', status: 'completed' },
        ],
        meta: {
          total: 50,
          page: 1,
          limit: 25,
          totalPages: 2,
        },
      };

      expect(response.data).toHaveLength(2);
      expect(response.data[0].status).toBe('active');
      expect(response.data[1].status).toBe('completed');
    });

    it('should work with array of primitives', () => {
      const response: PaginatedResponse<string> = {
        data: ['item1', 'item2', 'item3'],
        meta: {
          total: 10,
          page: 1,
          limit: 5,
          totalPages: 2,
        },
      };

      expect(response.data).toContain('item1');
      expect(response.meta.page).toBe(1);
    });
  });
});
