import {
  createEvent,
  getEventSupportersCount,
  getEvents,
  getMyJoinedEvents,
  joinEvent,
  leaveEvent,
} from './eventsService';
import { httpClient } from './httpClient';

jest.mock('./httpClient', () => ({
  httpClient: jest.fn(),
}));

const mockedHttpClient = httpClient as jest.MockedFunction<typeof httpClient>;

describe('eventsService', () => {
  beforeEach(() => {
    mockedHttpClient.mockReset();
  });

  it('builds event query with defaults', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getEvents();

    expect(mockedHttpClient).toHaveBeenCalledWith('/events?page=1&limit=50');
  });

  it('builds event query with optional filters', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [] } as never);

    await getEvents({ page: 2, limit: 20, city: 'Bogota', disasterType: 'inundacion', search: 'rio' });

    expect(mockedHttpClient).toHaveBeenCalledWith(
      '/events?page=2&limit=20&city=Bogota&disasterType=inundacion&search=rio'
    );
  });

  it('creates event', async () => {
    const payload = {
      name: 'Alerta Norte',
      disasterType: 'inundacion',
      city: 'Bogota',
      description: 'Afectaciones',
      date: '2026-03-11',
      createdBy: 1,
    };

    mockedHttpClient.mockResolvedValueOnce({ id: 9 } as never);

    await createEvent(payload);

    expect(mockedHttpClient).toHaveBeenCalledWith('/events', {
      method: 'POST',
      body: payload,
    });
  });

  it('joins an event', async () => {
    mockedHttpClient.mockResolvedValueOnce({ success: true } as never);
    await joinEvent(3, 'tok');
    expect(mockedHttpClient).toHaveBeenCalledWith('/events/3/join', { method: 'POST', token: 'tok' });
  });

  it('leaves an event', async () => {
    mockedHttpClient.mockResolvedValueOnce({ success: true } as never);
    await leaveEvent(3, 'tok');
    expect(mockedHttpClient).toHaveBeenCalledWith('/events/3/join', { method: 'DELETE', token: 'tok' });
  });

  it('gets supporters count', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: { eventId: 1, supportersCount: 5 } } as never);
    await getEventSupportersCount(1);
    expect(mockedHttpClient).toHaveBeenCalledWith('/events/1/supporters/count');
  });

  it('getMyJoinedEvents returns array from root array response', async () => {
    const events = [{ id: 1 }];
    mockedHttpClient.mockResolvedValueOnce(events as never);
    const result = await getMyJoinedEvents('tok');
    expect(result).toEqual(events);
  });

  it('getMyJoinedEvents returns array from root.data array', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: [{ id: 2 }] } as never);
    const result = await getMyJoinedEvents('tok');
    expect(result).toHaveLength(1);
  });

  it('getMyJoinedEvents returns array from nested data.data', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: { data: [{ id: 3 }] } } as never);
    const result = await getMyJoinedEvents('tok');
    expect(result).toHaveLength(1);
  });

  it('getMyJoinedEvents returns array from nested data.events', async () => {
    mockedHttpClient.mockResolvedValueOnce({ data: { events: [{ id: 4 }] } } as never);
    const result = await getMyJoinedEvents('tok');
    expect(result).toHaveLength(1);
  });

  it('getMyJoinedEvents returns empty array for null response', async () => {
    mockedHttpClient.mockResolvedValueOnce(null as never);
    const result = await getMyJoinedEvents('tok');
    expect(result).toEqual([]);
  });
});
