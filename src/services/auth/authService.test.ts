import { authService } from './authService';
import { httpClient } from '@/services/api/httpClient';

jest.mock('@/services/api/httpClient', () => ({
  httpClient: jest.fn(),
}));

const mockedHttpClient = httpClient as jest.MockedFunction<typeof httpClient>;

describe('authService', () => {
  it('loginWithGoogle sends token and role', async () => {
    mockedHttpClient.mockResolvedValueOnce({
      accessToken: 'tok',
      user: { id: 2, email: 'v@lastmile.com', role: 'volunteer' },
    });
    await authService.loginWithGoogle('google-token', 'volunteer');
    expect(mockedHttpClient).toHaveBeenCalledWith('/auth/google', {
      method: 'POST',
      body: { accessToken: 'google-token', role: 'volunteer' },
    });
  });

  it('loginWithGoogle sends token without role', async () => {
    mockedHttpClient.mockResolvedValueOnce({ requiresRoleSelection: true });
    await authService.loginWithGoogle('google-token');
    expect(mockedHttpClient).toHaveBeenCalledWith('/auth/google', {
      method: 'POST',
      body: { accessToken: 'google-token' },
    });
  });
});

describe('authService.login', () => {
  it('sends expected endpoint and payload', async () => {
    mockedHttpClient.mockResolvedValueOnce({
      accessToken: 'token',
      user: { id: 1, email: 'organizador@lastmile.com', role: 'organizer' },
    });

    const payload = { email: 'organizador@lastmile.com', password: '123456' };
    const response = await authService.login(payload);

    expect(mockedHttpClient).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: payload,
    });
    expect(response.accessToken).toBe('token');
  });
});
