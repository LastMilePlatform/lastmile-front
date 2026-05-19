import type { PaginatedResponse } from '@/types/pagination';

import { httpClient } from './httpClient';

export type CampaignType = 'money' | 'physical_items' | 'mixed';

export type Campaign = {
  id: number;
  name: string;
  description: string;
  campaignType: CampaignType;
  goalMoney: number;
  collectedMoney: number;
  eventId: number;
  createdBy: number;
};

export type CreateCampaignPayload = {
  name: string;
  description: string;
  campaignType: CampaignType;
  goalMoney: number;
  eventId: number;
  createdBy: number;
};

export async function getCampaigns(page = 1, limit = 50) {
  return httpClient<PaginatedResponse<Campaign>>(`/campaigns?page=${page}&limit=${limit}`);
}

export async function createCampaign(payload: CreateCampaignPayload) {
  return httpClient<Campaign>('/campaigns', {
    method: 'POST',
    body: payload,
  });
}
