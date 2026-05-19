import type { PaginatedResponse } from '@/types/pagination';

import { httpClient } from './httpClient';

export type AuctionStatus = 'created' | 'active' | 'closed' | 'sold' | 'cancelled';

export type AuctionBidMode = 'free' | 'fixed_increment';

export type Auction = {
  id: number;
  productId: number;
  sellerId: number;
  itemName: string;
  description: string | null;
  initialPrice: number;
  currentPrice: number | null;
  currency: string;
  durationMinutes: number;
  status: AuctionStatus;
  bidMode: AuctionBidMode;
  bidIncrement: number | null;
  buyerId: number | null;
  winnerId: number | null;
  startedAt: string | null;
  endAt: string | null;
  soldAt: string | null;
  createdAt: string;
  version: number;
};

export type AuctionBid = {
  id: number;
  auctionId: number;
  userId: number;
  amount: number;
  createdAt: string;
};

export type Bid = {
  id: number;
  auctionId: number;
  userId: number;
  amount: number;
  createdAt: string;
  currentAuctionPrice: number;
};

export type CreateAuctionPayload = {
  itemName: string;
  initialPrice: number;
  durationMinutes: number;
  currency?: string;
  bidMode?: AuctionBidMode;
  bidIncrement?: number;
};

export type PlaceBidPayload = {
  userId: number;
  amount?: number;
};

export type BuyAuctionPayload = {
  buyerId: number;
  idempotencyKey?: string;
};

export type CreateCampaignAuctionPayload = {
  sellerId: number;
  itemName: string;
  description?: string;
  price: number;
  currency: string;
};

export async function getAuctions(status?: AuctionStatus) {
  const query = status ? `?status=${status}` : '';
  return httpClient<PaginatedResponse<Auction>>(`/auctions${query}`);
}

export async function getAuction(id: number) {
  return httpClient<Auction>(`/auctions/${id}`);
}

export async function getCampaignAuctions(campaignId: number, status: 'active' | 'sold' | 'all' = 'all') {
  const statusParam = status;
  return httpClient<PaginatedResponse<Auction>>(`/campaigns/${campaignId}/auctions?status=${statusParam}&page=1&limit=100`);
}

export async function createCampaignAuction(campaignId: number, payload: CreateCampaignAuctionPayload) {
  return httpClient<Auction>(`/campaigns/${campaignId}/auctions`, {
    method: 'POST',
    body: payload,
  });
}

export async function createAuction(payload: CreateAuctionPayload, token?: string) {
  return httpClient<Auction>('/auctions', {
    method: 'POST',
    body: payload,
    token,
  });
}

export async function startAuction(id: number, token?: string) {
  return httpClient<Auction>(`/auctions/${id}/start`, {
    method: 'POST',
    token,
  });
}

export async function getAuctionBids(id: number, token?: string) {
  return httpClient<AuctionBid[]>(`/auctions/${id}/bids`, {
    token,
  });
}

export async function placeBid(auctionId: number, payload: PlaceBidPayload, token?: string) {
  return httpClient<Bid>(`/auctions/${auctionId}/bids`, {
    method: 'POST',
    body: payload,
    token,
  });
}

export async function buyAuction(auctionId: number, payload: BuyAuctionPayload, token?: string) {
  return httpClient<Auction>(`/auctions/${auctionId}/buy`, {
    method: 'POST',
    body: payload,
    token,
  });
}
