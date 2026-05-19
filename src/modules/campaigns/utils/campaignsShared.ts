import type { Auction } from '@/services/api/auctionsService';
import type { ItemDonationResponse } from '@/services/api/donationsService';

export type ChatMessage = {
  id: string;
  author: string;
  message: string;
  createdAt: string;
};

export type PhysicalDonationOption = {
  key: string;
  label: string;
};

export type ItemInventoryByCampaign = Record<number, Record<string, number>>;
export type AuctionMap = Record<number, Auction[]>;

export type ChatMessageCreatedEvent = {
  id: number | string;
  campaignId: number;
  authorId?: number;
  authorName?: string;
  message: string;
  createdAt?: string;
};

export type AuctionRealtimeEvent = {
  campaignId: number;
};

export type InventoryRealtimeEvent = {
  campaignId: number;
};

export type CampaignFundsRealtimeEvent = {
  campaignId: number;
  amount?: number;
};

export const PHYSICAL_DONATION_OPTIONS: PhysicalDonationOption[] = [
  { key: 'cama', label: 'Camas' },
  { key: 'colchon', label: 'Colchones' },
  { key: 'cobija', label: 'Cobijas' },
  { key: 'kit_higiene', label: 'Kits de higiene' },
  { key: 'alimento', label: 'Alimentos' },
];

export function normalizeCollection<T>(response: unknown): T[] {
  if (Array.isArray(response)) {
    return response as T[];
  }

  if (
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    Array.isArray((response as { data?: unknown }).data)
  ) {
    return (response as { data: T[] }).data;
  }

  return [];
}

export function buildInventoryMap(itemDonations: ItemDonationResponse[]): ItemInventoryByCampaign {
  return itemDonations.reduce<ItemInventoryByCampaign>((acc, donation) => {
    const campaignBucket = acc[donation.campaignId] ?? {};
    const itemKey = donation.itemType;

    acc[donation.campaignId] = {
      ...campaignBucket,
      [itemKey]: (campaignBucket[itemKey] ?? 0) + donation.quantity,
    };

    return acc;
  }, {});
}

export function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Error desconocido.';
  }

  const rawMessage = error.message?.trim();
  if (!rawMessage) {
    return 'Error desconocido.';
  }

  try {
    const parsed = JSON.parse(rawMessage) as { message?: string | string[] };

    if (Array.isArray(parsed.message)) {
      return parsed.message.join(' | ');
    }

    if (typeof parsed.message === 'string') {
      return parsed.message;
    }

    return rawMessage;
  } catch {
    return rawMessage;
  }
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}
