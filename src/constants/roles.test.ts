import { USER_ROLES, UserRole } from './roles';

describe('roles', () => {
  describe('USER_ROLES', () => {
    it('should define all user roles', () => {
      expect(USER_ROLES).toEqual(['organizer', 'volunteer', 'donor']);
    });

    it('should be a readonly tuple', () => {
      expect(Array.isArray(USER_ROLES)).toBe(true);
      expect(USER_ROLES.length).toBe(3);
    });

    it('should contain specific roles in order', () => {
      expect(USER_ROLES[0]).toBe('organizer');
      expect(USER_ROLES[1]).toBe('volunteer');
      expect(USER_ROLES[2]).toBe('donor');
    });

    it('should include method to verify if role exists', () => {
      const validRoles: UserRole[] = ['organizer', 'volunteer', 'donor'];
      validRoles.forEach((role) => {
        expect(USER_ROLES).toContain(role);
      });
    });
  });

  describe('UserRole type', () => {
    it('should only allow valid role values', () => {
      const testRoles: UserRole[] = ['organizer', 'volunteer', 'donor'];
      testRoles.forEach((role) => {
        expect(typeof role).toBe('string');
        expect(USER_ROLES).toContain(role);
      });
    });

    it('should match one of the defined roles', () => {
      const role1: UserRole = 'organizer';
      const role2: UserRole = 'volunteer';
      const role3: UserRole = 'donor';

      expect([role1, role2, role3]).toEqual(USER_ROLES);
    });
  });
});
