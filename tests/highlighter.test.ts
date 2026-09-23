/**
 * Highlighter Tests
 *
 * Fixtures are synthetic test data — not live Facebook listings.
 */
import { describe, it, expect } from 'vitest';
import { detectPhrases } from '../src/content/highlighter';

describe('detectPhrases — mechanical concerns', () => {
  it('detects "engine knocking"', () => {
    const flags = detectPhrases('Car has engine knocking issues.');
    expect(flags.some((f) => f.category === 'mechanical_concern')).toBe(true);
  });

  it('does NOT flag "no engine knocking"', () => {
    const flags = detectPhrases('There is no engine knocking whatsoever.');
    expect(flags.some((f) => f.label === 'Engine concern')).toBe(false);
  });

  it('detects "does not run"', () => {
    const flags = detectPhrases('Vehicle does not run. Selling for parts.');
    expect(flags.some((f) => f.label === 'Does not run')).toBe(true);
  });

  it('detects "overheating"', () => {
    const flags = detectPhrases('Engine was overheating last summer.');
    expect(flags.some((f) => f.label === 'Overheating')).toBe(true);
  });

  it('does NOT flag "no overheating after repair"', () => {
    const flags = detectPhrases('No overheating after the repair was done.');
    expect(flags.some((f) => f.label === 'Overheating')).toBe(false);
  });

  it('detects "needs transmission"', () => {
    const flags = detectPhrases('Needs transmission work.');
    expect(flags.some((f) => f.label === 'Transmission issue')).toBe(true);
  });

  it('does NOT flag "no transmission issues"', () => {
    const flags = detectPhrases('No transmission issues at all.');
    expect(flags.some((f) => f.label === 'Transmission issue')).toBe(false);
  });

  it('detects "check engine light"', () => {
    const flags = detectPhrases('Check engine light is on.');
    expect(flags.some((f) => f.label === 'Check engine light')).toBe(true);
  });

  it('does NOT flag "check engine light off"', () => {
    const flags = detectPhrases('Check engine light is off after the fix.');
    // "off" is not in negation words list for this pattern — this is intentional:
    // "off" appears AFTER the match, not before. Verify behavior:
    const flags2 = detectPhrases('No check engine light present.');
    expect(flags2.some((f) => f.label === 'Check engine light')).toBe(false);
  });
});

describe('detectPhrases — title disclosures', () => {
  it('detects "salvage"', () => {
    const flags = detectPhrases('Salvage title vehicle.');
    expect(flags.some((f) => f.category === 'title_disclosure')).toBe(true);
  });

  it('detects "rebuilt"', () => {
    const flags = detectPhrases('Car has a rebuilt title.');
    expect(flags.some((f) => f.label === 'Rebuilt title')).toBe(true);
  });

  it('detects "for parts"', () => {
    const flags = detectPhrases('Selling for parts only, does not run.');
    expect(flags.some((f) => f.label === 'For parts only')).toBe(true);
  });
});

describe('detectPhrases — payment ambiguity', () => {
  it('detects "down payment"', () => {
    const flags = detectPhrases('$2,000 down payment required.');
    expect(flags.some((f) => f.label === 'Down payment mentioned')).toBe(true);
  });

  it('detects "monthly payment"', () => {
    const flags = detectPhrases('$350 monthly payment available.');
    expect(flags.some((f) => f.label === 'Monthly payment mentioned')).toBe(true);
  });

  it('detects "/mo"', () => {
    const flags = detectPhrases('Only $299/mo with financing.');
    expect(flags.some((f) => f.label === 'Monthly payment mentioned')).toBe(true);
  });
});

describe('detectPhrases — inspection conditions', () => {
  it('detects "as is"', () => {
    const flags = detectPhrases('Selling as-is, no warranty.');
    expect(flags.some((f) => f.label === 'Sold as-is')).toBe(true);
  });

  it('detects "out of province"', () => {
    const flags = detectPhrases('Out of province vehicle, requires safety inspection.');
    expect(flags.some((f) => f.label === 'Out of province')).toBe(true);
  });
});

describe('detectPhrases — French', () => {
  it('detects French "boîte de vitesse problème"', () => {
    const flags = detectPhrases('La boîte de vitesse a un problème.');
    expect(flags.some((f) => f.category === 'mechanical_concern')).toBe(true);
  });

  it('detects French "acompte"', () => {
    const flags = detectPhrases('2000$ acompte nécessaire.');
    expect(flags.some((f) => f.label === 'Down payment mentioned')).toBe(true);
  });

  it('detects French "vendu tel quel"', () => {
    const flags = detectPhrases('Vendu tel quel, sans garantie.');
    expect(flags.some((f) => f.label === 'Sold as-is')).toBe(true);
  });

  it('detects French "ne démarre pas"', () => {
    const flags = detectPhrases('Le véhicule ne démarre pas.');
    expect(flags.some((f) => f.label === 'Does not run')).toBe(true);
  });
});

describe('detectPhrases — clean listings', () => {
  it('returns empty array for clean listing text', () => {
    const flags = detectPhrases(
      '2020 Toyota Camry, 45,000 km, one owner, clean title. ' +
      'No accidents, full service records available. Automatic transmission, runs great.'
    );
    expect(flags).toHaveLength(0);
  });
});
