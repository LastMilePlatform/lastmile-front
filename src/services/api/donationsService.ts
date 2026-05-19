import { httpClient } from './httpClient';

export type CreateMoneyDonationPayload = {
  campaignId: number;
  donorId: number;
  amount: number;
};

export type MoneyDonationResponse = {
  id: number;
  campaignId: number;
  donorId: number;
  amount: number;
  createdAt?: string;
};

export type DonationItemStatus =
  | 'pending'
  | 'delivered_to_pickup_point'
  | 'assigned_to_shipment'
  | 'delivered';

export type CreateItemDonationPayload = {
  campaignId: number;
  donorId: number;
  itemType: string;
  quantity: number;
  notes?: string;
};

export type ItemDonationResponse = {
  id: number;
  campaignId: number;
  donorId: number;
  itemType: string;
  quantity: number;
  notes?: string;
  status: DonationItemStatus;
  createdAt?: string;
};

export async function createMoneyDonation(payload: CreateMoneyDonationPayload) {
  return httpClient<MoneyDonationResponse>('/donations/money', {
    method: 'POST',
    body: payload,
  });
}

export async function createItemDonation(payload: CreateItemDonationPayload) {
  return httpClient<ItemDonationResponse>('/donations/items', {
    method: 'POST',
    body: payload,
  });
}

export async function getItemDonations(page = 1, limit = 200) {
  return httpClient<ItemDonationResponse[]>(`/donations/items?page=${page}&limit=${limit}`);
}
