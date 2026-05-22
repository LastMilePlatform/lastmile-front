import {
  buyAuction,
  createAuction,
  createCampaignAuction,
  getAuction,
  getAuctionBids,
  getAuctions,
  getCampaignAuctions,
  placeBid,
  startAuction,
} from './auctionsService';
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

  it('gets all auctions without status filter', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);
    await getAuctions();
    expect(mockedHttpClient).toHaveBeenCalledWith('/auctions');
  });

  it('gets auctions with status filter', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);
    await getAuctions('active');
    expect(mockedHttpClient).toHaveBeenCalledWith('/auctions?status=active');
  });

  it('gets a single auction by id', async () => {
    mockedHttpClient.mockResolvedValueOnce({ id: 5 } as never);
    await getAuction(5);
    expect(mockedHttpClient).toHaveBeenCalledWith('/auctions/5');
  });

  it('creates an auction', async () => {
    const payload = { itemName: 'Laptop', initialPrice: 1000, durationMinutes: 60 };
    mockedHttpClient.mockResolvedValueOnce({ id: 7 } as never);
    await createAuction(payload, 'tok');
    expect(mockedHttpClient).toHaveBeenCalledWith('/auctions', {
      method: 'POST',
      body: payload,
      token: 'tok',
    });
  });

  it('starts an auction', async () => {
    mockedHttpClient.mockResolvedValueOnce({ id: 7 } as never);
    await startAuction(7, 'tok');
    expect(mockedHttpClient).toHaveBeenCalledWith('/auctions/7/start', {
      method: 'POST',
      token: 'tok',
    });
  });

  it('gets auction bids', async () => {
    mockedHttpClient.mockResolvedValueOnce([] as never);
    await getAuctionBids(7, 'tok');
    expect(mockedHttpClient).toHaveBeenCalledWith('/auctions/7/bids', {
      token: 'tok',
    });
  });

  it('places a bid', async () => {
    const payload = { userId: 3, amount: 500 };
    mockedHttpClient.mockResolvedValueOnce({ id: 1 } as never);
    await placeBid(7, payload, 'tok');
    expect(mockedHttpClient).toHaveBeenCalledWith('/auctions/7/bids', {
      method: 'POST',
      body: payload,
      token: 'tok',
    });
  });
});
