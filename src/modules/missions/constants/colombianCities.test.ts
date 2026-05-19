import { COLOMBIAN_CITIES, findColombianCityByName } from './colombianCities';

describe('findColombianCityByName', () => {
  it('finds city by exact name', () => {
    const city = findColombianCityByName('Bogota');

    expect(city).toBeDefined();
    expect(city?.id).toBe('bogota');
  });

  it('finds city with mixed case and extra spaces', () => {
    const city = findColombianCityByName('   meDeLLin  ');

    expect(city).toBeDefined();
    expect(city?.name).toBe('Medellin');
  });

  it('returns undefined for unknown city', () => {
    const city = findColombianCityByName('Ciudad Inventada');

    expect(city).toBeUndefined();
  });

  it('keeps the Colombian city catalog loaded', () => {
    expect(COLOMBIAN_CITIES.length).toBeGreaterThan(5);
  });
});
