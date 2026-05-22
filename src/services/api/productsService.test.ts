import { createProduct, getProducts } from './productsService';
import { httpClient } from './httpClient';

jest.mock('./httpClient', () => ({
  httpClient: jest.fn(),
}));

const mockedHttpClient = httpClient as jest.MockedFunction<typeof httpClient>;

describe('productsService', () => {
  beforeEach(() => {
    mockedHttpClient.mockReset();
  });

  it('gets all products', async () => {
    mockedHttpClient.mockResolvedValueOnce([] as never);
    await getProducts();
    expect(mockedHttpClient).toHaveBeenCalledWith('/products');
  });

  it('creates a product', async () => {
    const payload = { name: 'Laptop', description: 'Used', createdBy: 1 };
    mockedHttpClient.mockResolvedValueOnce({ id: 1 } as never);
    await createProduct(payload);
    expect(mockedHttpClient).toHaveBeenCalledWith('/products', {
      method: 'POST',
      body: payload,
    });
  });

  it('creates a product without description', async () => {
    const payload = { name: 'Laptop', createdBy: 1 };
    mockedHttpClient.mockResolvedValueOnce({ id: 2 } as never);
    await createProduct(payload);
    expect(mockedHttpClient).toHaveBeenCalledWith('/products', {
      method: 'POST',
      body: payload,
    });
  });
});
