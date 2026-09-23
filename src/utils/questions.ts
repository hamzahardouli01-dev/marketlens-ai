/**
 * CarListing Lens — Seller Question Generator
 */

import type {
  MileageInfo,
  PriceInfo,
  FlaggedPhrase,
  SellerQuestion,
} from '../types/listing';

interface QuestionContext {
  mileage: MileageInfo;
  price: PriceInfo;
  transmission: string | null;
  fuelType: string | null;
  description: string | null;
  condition: string | null;
  flaggedPhrases: FlaggedPhrase[];
}

let _id = 0;
function q(text: string): SellerQuestion {
  return { id: `q${_id++}`, text, selected: true };
}

export function generateQuestions(ctx: QuestionContext): SellerQuestion[] {
  _id = 0;
  const questions: SellerQuestion[] = [];

  // Price ambiguity
  if (ctx.price.type !== 'asking' && ctx.price.type !== 'not_found') {
    questions.push(q('Is the listed price the full asking price, not a deposit or monthly payment?'));
  }
  if (ctx.price.type === 'not_found') {
    questions.push(q('What is the total asking price for the vehicle?'));
  }

  // Mileage
  if (!ctx.mileage.value) {
    questions.push(q('What is the current odometer reading?'));
  }

  // Missing fields
  if (!ctx.transmission) {
    questions.push(q('Is the transmission automatic or manual?'));
  }
  if (!ctx.fuelType) {
    questions.push(q('What type of fuel does the vehicle use?'));
  }

  // Condition
  if (!ctx.condition) {
    questions.push(q('Is this a clean title vehicle? Has it ever been rebuilt or declared a total loss?'));
  }

  // Always useful
  questions.push(q('Are service records or maintenance history available?'));
  questions.push(q('Has the vehicle had any accidents or been repaired after a collision?'));

  // Flag-based questions
  const cats = new Set(ctx.flaggedPhrases.map((f) => f.category));
  if (cats.has('mechanical_concern')) {
    questions.push(q('What repairs are currently needed on the vehicle?'));
    questions.push(q('Is the vehicle in driveable condition?'));
  }
  if (cats.has('inspection_condition')) {
    questions.push(q('Will the seller allow an independent mechanic inspection before purchase?'));
  }
  if (cats.has('payment_ambiguity')) {
    questions.push(q('Is the listed price the full asking price for an outright purchase?'));
  }

  // Description quality
  if (!ctx.description || ctx.description.length < 50) {
    questions.push(q("Can you provide more details about the vehicle's condition and history?"));
  }

  return questions;
}
