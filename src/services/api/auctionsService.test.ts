import { buyAuction, createCampaignAuction, getCampaignAuctions } from './auctionsService';
import { httpClient } from './httpClient';

jest.mock('./httpClient', () => ({
  httpClient: jest.fn(),
}));

const mockedHttpClient = httpClient as jest.MockedFunction<typeof httpClient>;

describe('auctionsService', () => {
  beforeEach(() => {
    mockedHttpClient.mockReset();
  });

  it('requests campaign auctions with selected status', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getCampaignAuctions(77, 'sold');

    expect(mockedHttpClient).toHaveBeenCalledWith('/campaigns/77/auctions?status=sold&page=1&limit=100');
  });

  it('requests campaign auctions with default status', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getCampaignAuctions(77);

    expect(mockedHttpClient).toHaveBeenCalledWith('/campaigns/77/auctions?status=all&page=1&limit=100');
  });

  it('creates auction with payload', async () => {
    const payload = { sellerId: 1, itemName: 'Nevera', description: 'Usada', price: 50000, currency: 'COP' };
    mockedHttpClient.mockResolvedValueOnce({ id: 1 } as never);

    await createCampaignAuction(10, payload);

    expect(mockedHttpClient).toHaveBeenCalledWith('/campaigns/10/auctions', {
      method: 'POST',
      body: payload,
    });
  });

  it('buys auction with idempotency key', async () => {
    const payload = { buyerId: 9, idempotencyKey: 'abc' };
    mockedHttpClient.mockResolvedValueOnce({ id: 1 } as never);

    await buyAuction(44, payload);

    expect(mockedHttpClient).toHaveBeenCalledWith('/auctions/44/buy', {
      method: 'POST',
      body: payload,
    });
  });
});
