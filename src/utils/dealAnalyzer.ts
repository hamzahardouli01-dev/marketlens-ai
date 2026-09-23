/**
 * CarListing Lens — Deal Analyzer & Buyer Shield Engine
 *
 * Evaluates listing safety, calculates annual mileage wear,
 * detects missing seller disclosures, and generates 1-click
 * Facebook Messenger buyer inquiries.
 */

import type {
  ListingData,
  DealRiskVerdict,
  DealRiskLevel,
  MileageAnalysis,
  MissingDisclosure,
} from '../types/listing';

// ─── Deal Risk Assessment ─────────────────────────────────────────────────────

export function computeDealRisk(data: ListingData): DealRiskVerdict {
  const reasons: string[] = [];
  let level: DealRiskLevel = 'low';

  // 1. High-Risk Triggers: Mechanical failure or Salvage/Rebuilt title
  const mechanicalFlags = data.flaggedPhrases.filter(
    (f) => f.category === 'mechanical_concern'
  );
  if (mechanicalFlags.length > 0) {
    level = 'high';
    for (const flag of mechanicalFlags) {
      reasons.push(`Mechanical alert: ${flag.label} (${flag.keyword})`);
    }
  }

  const titleFlags = data.flaggedPhrases.filter(
    (f) => f.category === 'title_disclosure'
  );
  if (titleFlags.length > 0) {
    level = 'high';
    for (const flag of titleFlags) {
      reasons.push(`Title alert: ${flag.label} disclosed in description`);
    }
  }

  // 2. Caution Triggers: Payment traps, As-Is clauses, or unverified details
  if (data.price.type === 'down_payment') {
    if (level !== 'high') level = 'caution';
    reasons.push('Price trap: Listed price appears to be a down payment, not full price');
  } else if (data.price.type === 'monthly') {
    if (level !== 'high') level = 'caution';
    reasons.push('Financing alert: Listed price is a monthly payment');
  } else if (data.price.type === 'deposit') {
    if (level !== 'high') level = 'caution';
    reasons.push('Deposit alert: Listed price may be an initial deposit');
  } else if (data.price.type === 'unclear') {
    if (level !== 'high') level = 'caution';
    reasons.push('Price ambiguity: Payment structure unclear in listing text');
  }

  const inspectionFlags = data.flaggedPhrases.filter(
    (f) => f.category === 'inspection_condition'
  );
  if (inspectionFlags.length > 0) {
    if (level !== 'high') level = 'caution';
    for (const flag of inspectionFlags) {
      reasons.push(`Condition note: ${flag.label}`);
    }
  }

  // Mileage analysis check
  const mileageCheck = analyzeMileage(data);
  if (mileageCheck.assessment === 'high') {
    if (level !== 'high') level = 'caution';
    reasons.push(`High annual mileage: ~${mileageCheck.annualUsage?.toLocaleString()} ${mileageCheck.unit}/yr`);
  }

  // Final summary and label mapping
  if (level === 'high') {
    return {
      level: 'high',
      scoreLabel: '🔴 High Risk / Potential Money Pit',
      summary: 'Critical concerns detected (mechanical failure, salvage/rebuilt title, or non-running vehicle).',
      badgeColor: 'var(--red)',
      reasons,
    };
  }

  if (level === 'caution') {
    return {
      level: 'caution',
      scoreLabel: '🟡 Caution / Hidden Details Detected',
      summary: reasons.length > 0
        ? reasons[0]
        : 'Payment ambiguity or condition disclosures require seller confirmation.',
      badgeColor: 'var(--yellow)',
      reasons,
    };
  }

  return {
    level: 'low',
    scoreLabel: '🟢 Low Risk / Looks Clean',
    summary: 'No critical red flags or payment traps detected in the listing description.',
    badgeColor: 'var(--green)',
    reasons: ['Clean pricing format', 'No severe mechanical concerns detected in ad text'],
  };
}

// ─── Mileage Reality Check ────────────────────────────────────────────────────

export function analyzeMileage(data: ListingData): MileageAnalysis {
  if (!data.mileage.value) {
    return {
      annualUsage: null,
      unit: '',
      assessment: 'unknown',
      label: 'Mileage Not Disclosed',
      detail: 'Seller did not provide an odometer reading.',
    };
  }

  const currentYear = new Date().getFullYear();
  const vehicleYear = data.year && data.year > 1980 && data.year <= currentYear + 1
    ? data.year
    : currentYear - 5; // fallback to 5 years if year unknown

  const ageYears = Math.max(1, currentYear - vehicleYear);
  const annual = Math.round(data.mileage.value / ageYears);
  const unit = data.mileage.unit === 'unknown' ? 'mi' : data.mileage.unit;

  const isKm = unit === 'km';
  const lowThreshold = isKm ? 14000 : 9000;
  const highThreshold = isKm ? 24000 : 16000;

  if (annual < lowThreshold) {
    return {
      annualUsage: annual,
      unit,
      assessment: 'low',
      label: '🟢 Low Usage for Age',
      detail: `~${annual.toLocaleString()} ${unit}/yr over ${ageYears} yr${ageYears > 1 ? 's' : ''} (below average wear)`,
    };
  }

  if (annual > highThreshold) {
    return {
      annualUsage: annual,
      unit,
      assessment: 'high',
      label: '⚠️ High Annual Usage',
      detail: `~${annual.toLocaleString()} ${unit}/yr over ${ageYears} yr${ageYears > 1 ? 's' : ''} (heavy highway or fleet use)`,
    };
  }

  return {
    annualUsage: annual,
    unit,
    assessment: 'average',
    label: '✓ Normal Commuter Mileage',
    detail: `~${annual.toLocaleString()} ${unit}/yr over ${ageYears} yr${ageYears > 1 ? 's' : ''} (typical commuter use)`,
  };
}

// ─── Missing Disclosures Radar ────────────────────────────────────────────────

export function detectMissingDisclosures(data: ListingData): MissingDisclosure[] {
  const missing: MissingDisclosure[] = [];
  const text = (data.description ?? '').toLowerCase();

  // 1. VIN check (17 character standard VIN or explicit mention)
  const hasVin = /\b[a-hj-npr-z0-9]{17}\b/i.test(text) || /\bvin[:\s#]/i.test(text);
  if (!hasVin) {
    missing.push({
      key: 'vin',
      label: 'VIN Omitted',
      severity: 'warning',
      detail: 'No VIN provided to verify accidents or theft history.',
    });
  }

  // 2. Title Status check
  const mentionsTitle = /\b(clean\s*title|clean|rebuilt|salvage|titre\s*(propre|net|reconstruit|épave))\b/i.test(text);
  if (!mentionsTitle && !data.condition) {
    missing.push({
      key: 'title',
      label: 'Title Status Unconfirmed',
      severity: 'warning',
      detail: 'Ad does not confirm if vehicle has a clean, rebuilt, or salvage title.',
    });
  }

  // 3. Mileage check
  if (!data.mileage.value) {
    missing.push({
      key: 'mileage',
      label: 'Odometer Reading Missing',
      severity: 'warning',
      detail: 'Current odometer reading is not stated.',
    });
  }

  // 4. Transmission
  if (!data.transmission) {
    missing.push({
      key: 'transmission',
      label: 'Transmission Not Specified',
      severity: 'info',
      detail: 'Automatic vs Manual is not listed.',
    });
  }

  // 5. Short description check
  if (!data.description || data.description.trim().length < 60) {
    missing.push({
      key: 'brevity',
      label: 'Sparse Description',
      severity: 'info',
      detail: 'Seller provided very little background information on the vehicle.',
    });
  }

  return missing;
}

// ─── 1-Click Seller Message Generator ─────────────────────────────────────────

export function generateSellerMessage(
  data: ListingData,
  risk: DealRiskVerdict,
  missing: MissingDisclosure[]
): string {
  const vehicleName = [data.year, data.make, data.model].filter(Boolean).join(' ') || data.title || 'vehicle';
  const priceRaw = data.price.raw || 'the listed price';

  const questions: string[] = [];

  // Question on price if ambiguous or down payment
  if (data.price.type === 'down_payment' || data.price.type === 'monthly' || data.price.type === 'deposit') {
    questions.push(`Is ${priceRaw} the full cash purchase price, or is it a down payment / financing?`);
  } else if (data.price.type !== 'not_found') {
    questions.push(`Can you confirm if ${priceRaw} is the full out-the-door price with no additional fees?`);
  }

  // Title verification
  const titleMissing = missing.some((m) => m.key === 'title');
  if (titleMissing) {
    questions.push('Does it have a clean title in your name, with no liens?');
  }

  // VIN verification
  const vinMissing = missing.some((m) => m.key === 'vin');
  if (vinMissing) {
    questions.push('Could you share the 17-digit VIN so I can check the Carfax/history report?');
  }

  // Mileage verification
  if (!data.mileage.value) {
    questions.push('What is the current exact odometer reading?');
  }

  // Mechanical issues if flagged
  const mechFlags = data.flaggedPhrases.filter((f) => f.category === 'mechanical_concern');
  if (mechFlags.length > 0) {
    const issues = mechFlags.map((f) => f.label.toLowerCase()).join(', ');
    questions.push(`Regarding the ${issues} mentioned, what repairs or work are currently needed?`);
  }

  // Maintenance & Inspection
  questions.push('Do you have service/maintenance records, and would you allow a pre-purchase mechanic inspection?');

  const questionBullets = questions.map((q) => `• ${q}`).join('\n');

  return (
    `Hi! I saw your listing for the ${vehicleName}. Is it still available?\n\n` +
    `I'm very interested, but had a few quick questions before arranging a viewing:\n` +
    `${questionBullets}\n\n` +
    `Thanks so much! Looking forward to your reply.`
  );
}
