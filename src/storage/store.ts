/**
 * CarListing Lens — chrome.storage.local wrapper
 *
 * All saved listings are stored under key "savedListings".
 * Data is keyed by listing ID (from URL) or a URL-based hash.
 */

import type { SavedListing, ListingData, PriceSnapshot } from '../types/listing';

const STORAGE_KEY = 'savedListings';

function normalizeId(data: ListingData): string {
  if (data.listingId) return data.listingId;
  // Hash the normalized URL as fallback
  let hash = 5381;
  for (let i = 0; i < data.url.length; i++) {
    hash = ((hash << 5) + hash) ^ data.url.charCodeAt(i);
  }
  return 'url_' + Math.abs(hash).toString(36);
}

export async function getAllSaved(): Promise<SavedListing[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const map: Record<string, SavedListing> = (result[STORAGE_KEY] ?? {}) as Record<string, SavedListing>;
      resolve(Object.values(map));
    });
  });
}

async function getMap(): Promise<Record<string, SavedListing>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve((result[STORAGE_KEY] ?? {}) as Record<string, SavedListing>);
    });
  });
}

async function saveMap(map: Record<string, SavedListing>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: map }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

export async function getById(id: string): Promise<SavedListing | null> {
  const map = await getMap();
  return map[id] ?? null;
}

export async function getByListingData(data: ListingData): Promise<SavedListing | null> {
  const id = normalizeId(data);
  return getById(id);
}

/** Save a new listing. If it already exists, throws — use updateListing instead. */
export async function saveListing(data: ListingData): Promise<SavedListing> {
  const map = await getMap();
  const id = normalizeId(data);

  if (map[id]) {
    throw new Error(`Listing ${id} already saved. Use updateListing.`);
  }

  const priceSnapshot: PriceSnapshot = {
    value: data.price.value,
    raw: data.price.raw,
    currency: data.price.currency,
    type: data.price.type,
    timestamp: data.extractedAt,
  };

  const saved: SavedListing = {
    id,
    data,
    priceHistory: [priceSnapshot],
    notes: '',
    status: 'interested',
    savedAt: Date.now(),
    updatedAt: Date.now(),
    hasUserEdits: false,
  };

  map[id] = saved;
  await saveMap(map);
  return saved;
}

/**
 * Update an existing saved listing with newly extracted data.
 * Preserves price history and user notes/status.
 */
export async function updateListingData(
  id: string,
  newData: ListingData
): Promise<SavedListing> {
  const map = await getMap();
  const existing = map[id];
  if (!existing) throw new Error(`Listing ${id} not found.`);

  // Append to price history if price changed
  const lastPrice = existing.priceHistory[existing.priceHistory.length - 1];
  const newSnapshot: PriceSnapshot = {
    value: newData.price.value,
    raw: newData.price.raw,
    currency: newData.price.currency,
    type: newData.price.type,
    timestamp: newData.extractedAt,
  };

  const priceChanged =
    lastPrice.value !== newSnapshot.value || lastPrice.raw !== newSnapshot.raw;

  const updated: SavedListing = {
    ...existing,
    data: newData,
    priceHistory: priceChanged
      ? [...existing.priceHistory, newSnapshot]
      : existing.priceHistory,
    updatedAt: Date.now(),
  };

  map[id] = updated;
  await saveMap(map);
  return updated;
}

/** Update user-controlled fields (notes, status) */
export async function updateUserFields(
  id: string,
  fields: { notes?: string; status?: SavedListing['status'] }
): Promise<SavedListing> {
  const map = await getMap();
  const existing = map[id];
  if (!existing) throw new Error(`Listing ${id} not found.`);

  const updated: SavedListing = {
    ...existing,
    notes: fields.notes !== undefined ? fields.notes : existing.notes,
    status: fields.status ?? existing.status,
    updatedAt: Date.now(),
    hasUserEdits: true,
  };

  map[id] = updated;
  await saveMap(map);
  return updated;
}

export async function deleteListing(id: string): Promise<void> {
  const map = await getMap();
  delete map[id];
  await saveMap(map);
}

export async function clearAllListings(): Promise<void> {
  await saveMap({});
}
