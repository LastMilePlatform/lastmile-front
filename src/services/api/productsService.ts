import { httpClient } from './httpClient';

export type Product = {
  id: number;
  name: string;
  description: string | null;
  createdBy: number;
  createdAt: string;
};

export type CreateProductPayload = {
  name: string;
  description?: string;
  createdBy: number;
};

export async function getProducts() {
  return httpClient<Product[]>('/products');
}

export async function createProduct(payload: CreateProductPayload) {
  return httpClient<Product>('/products', {
    method: 'POST',
    body: payload,
  });
}
