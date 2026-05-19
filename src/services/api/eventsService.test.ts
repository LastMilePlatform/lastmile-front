import { createEvent, getEvents } from './eventsService';
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
});
