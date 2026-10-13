/**
 * User-facing error detail tests
 */
import { describe, it, expect } from 'vitest';
import { publicErrorDetail } from '../src/utils/errors';

describe('publicErrorDetail', () => {
  it('hides technical and third-party error text', () => {
    expect(publicErrorDetail('Gemini AI service unavailable: 429 RESOURCE_EXHAUSTED')).toBe('');
    expect(publicErrorDetail('SERVER_CONFIG_ERROR: Backend API key is not configured')).toBe('');
    expect(publicErrorDetail('POST https://example.googleapis.com/v1beta failed')).toBe('');
    expect(publicErrorDetail('Failed to fetch')).toBe('');
    expect(publicErrorDetail('The analysis service is temporarily unavailable.')).toBe('');
  });

  it('shows the extension’s own messages without the code prefix', () => {
    expect(publicErrorDetail('NOT_A_LISTING: Open an item listing first.')).toBe('Open an item listing first.');
  });

  it('handles empty and very long messages', () => {
    expect(publicErrorDetail('')).toBe('');
    expect(publicErrorDetail(undefined)).toBe('');
    expect(publicErrorDetail(`NOT_A_LISTING: ${'x'.repeat(500)}`).length).toBeLessThanOrEqual(200);
  });
});
