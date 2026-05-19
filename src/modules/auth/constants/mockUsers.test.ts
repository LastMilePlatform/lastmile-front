import { MOCK_USERS, validateMockCredentials } from './mockUsers';

describe('validateMockCredentials', () => {
  it('matches users with normalized email and password', () => {
    const user = validateMockCredentials('  DONANTE@lastmile.com  ', '123456');

    expect(user).toBeDefined();
    expect(user?.role).toBe('donor');
  });

  it('returns undefined for wrong password', () => {
    const user = validateMockCredentials(MOCK_USERS[0].email, 'bad-password');

    expect(user).toBeUndefined();
  });

  it('returns undefined for unknown email', () => {
    const user = validateMockCredentials('missing@lastmile.com', '123456');

    expect(user).toBeUndefined();
  });
});
