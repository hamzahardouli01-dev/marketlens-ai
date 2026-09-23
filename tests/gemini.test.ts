import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildSystemPrompt,
  getGeminiApiKey,
  setGeminiApiKey,
} from '../src/services/gemini';
import type { UniversalListingContext } from '../src/types/ai';

describe('Gemini AI Service — Prompt Formulation & Key Management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and retrieves the Gemini API key correctly', async () => {
    expect(await getGeminiApiKey()).toBeNull();
    await setGeminiApiKey('AIzaSyTestKey123456');
    expect(await getGeminiApiKey()).toBe('AIzaSyTestKey123456');
  });

  it('builds system prompt with full context and structured schema', () => {
    const context: UniversalListingContext = {
      url: 'https://www.facebook.com/marketplace/item/987654',
      title: 'Sony PlayStation 5 Disc Edition + 2 Controllers',
      priceRaw: '$350',
      currency: 'USD',
      description: 'Gently used PS5 console with power cord, HDMI, and two original DualSense controllers.',
      imageUrl: 'https://example.com/ps5.jpg',
    };

    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain('Sony PlayStation 5 Disc Edition');
    expect(prompt).toContain('$350');
    expect(prompt).toContain('USD');
    expect(prompt).toContain('DualSense');
    expect(prompt).toContain('"identifiedProduct"');
    expect(prompt).toContain('"pricing"');
    expect(prompt).toContain('"flipPotential"');
    expect(prompt).toContain('"visualAudit"');
    expect(prompt).toContain('"negotiation"');
    expect(prompt).toContain('"buyScore"');
    expect(prompt).toContain('"buyVerdict"');
    expect(prompt).toContain('"redFlags"');
    expect(prompt).toContain('"questionsToAsk"');
    expect(prompt).toContain('walk_away');
    expect(prompt).toContain('fast_flip');
  });
});
