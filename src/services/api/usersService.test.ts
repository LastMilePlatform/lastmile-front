import { getUsers } from './usersService';
import { httpClient } from './httpClient';

jest.mock('./httpClient', () => ({
  httpClient: jest.fn(),
}));

const mockedHttpClient = httpClient as jest.MockedFunction<typeof httpClient>;

describe('usersService', () => {
  beforeEach(() => {
    mockedHttpClient.mockReset();
  });

  it('gets users with defaults', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getUsers();

    expect(mockedHttpClient).toHaveBeenCalledWith('/users?page=1&limit=100');
  });

  it('gets users with custom pagination', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getUsers(3, 10);

    expect(mockedHttpClient).toHaveBeenCalledWith('/users?page=3&limit=10');
  });
});
