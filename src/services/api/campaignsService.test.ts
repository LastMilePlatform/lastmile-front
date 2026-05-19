import { createCampaign, getCampaigns } from './campaignsService';
import { httpClient } from './httpClient';

jest.mock('./httpClient', () => ({
  httpClient: jest.fn(),
}));

const mockedHttpClient = httpClient as jest.MockedFunction<typeof httpClient>;

describe('campaignsService', () => {
  beforeEach(() => {
    mockedHttpClient.mockReset();
  });

  it('gets campaigns with defaults', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getCampaigns();

    expect(mockedHttpClient).toHaveBeenCalledWith('/campaigns?page=1&limit=50');
  });

  it('gets campaigns with custom pagination', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getCampaigns(2, 15);

    expect(mockedHttpClient).toHaveBeenCalledWith('/campaigns?page=2&limit=15');
  });

  it('creates campaign', async () => {
    const payload = {
      name: 'Campana Norte',
      description: 'Apoyo',
      campaignType: 'money' as const,
      goalMoney: 500000,
      eventId: 3,
      createdBy: 1,
    };

    mockedHttpClient.mockResolvedValueOnce({ id: 10 } as never);

    await createCampaign(payload);

    expect(mockedHttpClient).toHaveBeenCalledWith('/campaigns', {
      method: 'POST',
      body: payload,
    });
  });
});
