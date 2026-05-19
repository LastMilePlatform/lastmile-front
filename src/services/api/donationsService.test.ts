import { createItemDonation, createMoneyDonation, getItemDonations } from './donationsService';
import { httpClient } from './httpClient';

jest.mock('./httpClient', () => ({
  httpClient: jest.fn(),
}));

const mockedHttpClient = httpClient as jest.MockedFunction<typeof httpClient>;

describe('donationsService', () => {
  beforeEach(() => {
    mockedHttpClient.mockReset();
  });

  it('creates money donation', async () => {
    const payload = { campaignId: 1, donorId: 2, amount: 70000 };
    mockedHttpClient.mockResolvedValueOnce({ id: 1 } as never);

    await createMoneyDonation(payload);

    expect(mockedHttpClient).toHaveBeenCalledWith('/donations/money', {
      method: 'POST',
      body: payload,
    });
  });

  it('creates item donation', async () => {
    const payload = { campaignId: 1, donorId: 2, itemType: 'cobija', quantity: 5 };
    mockedHttpClient.mockResolvedValueOnce({ id: 2 } as never);

    await createItemDonation(payload);

    expect(mockedHttpClient).toHaveBeenCalledWith('/donations/items', {
      method: 'POST',
      body: payload,
    });
  });

  it('gets item donations with default pagination', async () => {
    mockedHttpClient.mockResolvedValueOnce([] as never);

    await getItemDonations();

    expect(mockedHttpClient).toHaveBeenCalledWith('/donations/items?page=1&limit=200');
  });
});
