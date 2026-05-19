import { getShipmentLatestLocation, getShipmentLocationHistory } from './trackingApi';
import { httpClient } from './httpClient';

jest.mock('./httpClient', () => ({
  httpClient: jest.fn(),
}));

const mockedHttpClient = httpClient as jest.MockedFunction<typeof httpClient>;

describe('trackingApi', () => {
  beforeEach(() => {
    mockedHttpClient.mockReset();
  });

  it('returns null when latest location response is null', async () => {
    mockedHttpClient.mockResolvedValueOnce(null as never);

    const result = await getShipmentLatestLocation(7);

    expect(result).toBeNull();
    expect(mockedHttpClient).toHaveBeenCalledWith('/logistics/shipments/7/location/latest');
  });

  it('normalizes latest location payload aliases', async () => {
    mockedHttpClient.mockResolvedValueOnce({
      shipment_id: 7,
      latitude: 4.7,
      longitude: -74.0,
      speed: null,
      heading: 30,
      recorded_at: '2026-03-11T00:00:00.000Z',
    } as never);

    const result = await getShipmentLatestLocation(7);

    expect(result).toEqual({
      shipmentId: 7,
      lat: 4.7,
      lng: -74,
      speed: undefined,
      heading: 30,
      recordedAt: '2026-03-11T00:00:00.000Z',
    });
  });

  it('returns null for latest location payload without coordinates', async () => {
    mockedHttpClient.mockResolvedValueOnce({ shipmentId: 7, recordedAt: '2026-03-11T00:00:00.000Z' } as never);

    const result = await getShipmentLatestLocation(7);

    expect(result).toBeNull();
  });

  it('filters invalid points from location history', async () => {
    mockedHttpClient.mockResolvedValueOnce([
      { lat: 4.7, lng: -74.0, recordedAt: '2026-03-11T00:00:00.000Z' },
      { lat: 'bad', lng: -74.0 },
      { latitude: 6.2, longitude: -75.5, recorded_at: '2026-03-11T01:00:00.000Z' },
    ] as never);

    const result = await getShipmentLocationHistory(8, 20, '2026-03-11T02:00:00.000Z');

    expect(mockedHttpClient).toHaveBeenCalledWith(
      '/logistics/shipments/8/location/history?limit=20&before=2026-03-11T02%3A00%3A00.000Z'
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.shipmentId).toBe(8);
    expect(result[1]?.lat).toBe(6.2);
  });

  it('builds history query without before and keeps shipmentId from payload', async () => {
    mockedHttpClient.mockResolvedValueOnce([
      { shipmentId: 99, lat: 4.6, lng: -74.1, recordedAt: '2026-03-11T00:00:00.000Z' },
    ] as never);

    const result = await getShipmentLocationHistory(8);

    expect(mockedHttpClient).toHaveBeenCalledWith('/logistics/shipments/8/location/history?limit=100');
    expect(result[0]?.shipmentId).toBe(99);
  });
});
