import { authService } from './authService';
import { httpClient } from '@/services/api/httpClient';

jest.mock('@/services/api/httpClient', () => ({
  httpClient: jest.fn(),
}));

const mockedHttpClient = httpClient as jest.MockedFunction<typeof httpClient>;

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
