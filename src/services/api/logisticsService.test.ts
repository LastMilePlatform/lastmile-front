import {
  assignShipmentVolunteer,
  createShipment,
  createPickupPoint,
  getPickupPoints,
  getShipments,
} from './logisticsService';
import { httpClient } from './httpClient';

jest.mock('./httpClient', () => ({
  httpClient: jest.fn(),
}));

const mockedHttpClient = httpClient as jest.MockedFunction<typeof httpClient>;

describe('logisticsService', () => {
  beforeEach(() => {
    mockedHttpClient.mockReset();
  });

  it('gets pickup points with defaults', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getPickupPoints();

    expect(mockedHttpClient).toHaveBeenCalledWith('/logistics/pickup-points?page=1&limit=100', {
      token: undefined,
    });
  });

  it('creates pickup point', async () => {
    const payload = { name: 'P1', address: 'Calle 1', city: 'Bogota', eventId: 10 };
    mockedHttpClient.mockResolvedValueOnce({ id: 1 } as never);

    await createPickupPoint(payload);

    expect(mockedHttpClient).toHaveBeenCalledWith('/logistics/pickup-points', {
      method: 'POST',
      token: undefined,
      body: payload,
    });
  });

  it('gets shipments with custom pagination', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getShipments(2, 30);

    expect(mockedHttpClient).toHaveBeenCalledWith('/logistics/shipments?page=2&limit=30', {
      token: undefined,
    });
  });

  it('gets shipments with default pagination', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getShipments();

    expect(mockedHttpClient).toHaveBeenCalledWith('/logistics/shipments?page=1&limit=100', {
      token: undefined,
    });
  });

  it('assigns volunteer to shipment', async () => {
    mockedHttpClient.mockResolvedValueOnce({ id: 3 } as never);

    await assignShipmentVolunteer(3, 44);

    expect(mockedHttpClient).toHaveBeenCalledWith('/logistics/shipments/3/assign-volunteer', {
      method: 'PATCH',
      token: undefined,
      body: { volunteerId: 44 },
    });
  });

  it('creates shipment', async () => {
    mockedHttpClient.mockResolvedValueOnce({ id: 5 } as never);

    await createShipment({ campaignId: 7, pickupPointId: 11 });

    expect(mockedHttpClient).toHaveBeenCalledWith('/logistics/shipments', {
      method: 'POST',
      token: undefined,
      body: { campaignId: 7, pickupPointId: 11 },
    });
  });
});
