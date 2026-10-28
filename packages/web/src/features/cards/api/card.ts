import type {
  CardSearchResult,
  CardTextSearchResult,
} from "@magic-vault/shared";
import { apiPostForm } from "@/lib/api/client";

export async function searchByImage(formData: FormData): Promise<CardSearchResult> {
  return apiPostForm<CardSearchResult>("/api/cards", formData);
}

/** Store a card the catalog lacks, with the scanned card as its picture (image, cardId, collectionGuid). */
export async function learnCard(
  formData: FormData,
): Promise<{ success: boolean; message: string }> {
  return apiPostForm<{ success: boolean; message: string }>("/api/cards/learn", formData);
}

export async function searchByVector(formData: FormData): Promise<CardSearchResult> {
  return apiPostForm<CardSearchResult>("/api/cards/by-vector", formData);
}

export async function searchByText(
  formData: FormData,
): Promise<CardTextSearchResult> {
  return apiPostForm<CardTextSearchResult>("/api/cards/by-text", formData);
}
