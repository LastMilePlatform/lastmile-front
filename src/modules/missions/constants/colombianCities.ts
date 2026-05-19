export type ColombianCity = {
  id: string;
  name: string;
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
};

export const COLOMBIAN_CITIES: ColombianCity[] = [
  {
    id: 'bogota',
    name: 'Bogota',
    region: {
      latitude: 4.711,
      longitude: -74.0721,
      latitudeDelta: 0.28,
      longitudeDelta: 0.28,
    },
  },
  {
    id: 'medellin',
    name: 'Medellin',
    region: {
      latitude: 6.2442,
      longitude: -75.5812,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    },
  },
  {
    id: 'cali',
    name: 'Cali',
    region: {
      latitude: 3.4516,
      longitude: -76.532,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    },
  },
  {
    id: 'barranquilla',
    name: 'Barranquilla',
    region: {
      latitude: 10.9685,
      longitude: -74.7813,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    },
  },
  {
    id: 'cartagena',
    name: 'Cartagena',
    region: {
      latitude: 10.391,
      longitude: -75.4794,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    },
  },
  {
    id: 'bucaramanga',
    name: 'Bucaramanga',
    region: {
      latitude: 7.1193,
      longitude: -73.1227,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    },
  },
  {
    id: 'manizales',
    name: 'Manizales',
    region: {
      latitude: 5.0703,
      longitude: -75.5138,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    },
  },
  {
    id: 'pasto',
    name: 'Pasto',
    region: {
      latitude: 1.2136,
      longitude: -77.2811,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    },
  },
  {
    id: 'cucuta',
    name: 'Cucuta',
    region: {
      latitude: 7.8891,
      longitude: -72.4967,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    },
  },
  {
    id: 'villavicencio',
    name: 'Villavicencio',
    region: {
      latitude: 4.142,
      longitude: -73.6266,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    },
  },
];

function normalizeCityName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function findColombianCityByName(cityName: string) {
  const normalizedTarget = normalizeCityName(cityName);

  return COLOMBIAN_CITIES.find(
    (city) => normalizeCityName(city.name) === normalizedTarget
  );
}
