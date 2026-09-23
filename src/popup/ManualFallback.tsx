import React, { useState } from 'react';
import type { ListingData, MileageUnit, Currency } from '../types/listing';
import { detectPhrases } from '../content/highlighter';
import { generateQuestions } from '../utils/questions';

interface Props {
  onComplete: (data: ListingData) => void;
  onBack: () => void;
}

export default function ManualFallback({ onComplete, onBack }: Props) {
  const [form, setForm] = useState({
    url: '',
    title: '',
    priceRaw: '',
    priceCurrency: 'unknown' as Currency,
    year: '',
    make: '',
    model: '',
    mileageRaw: '',
    mileageUnit: 'km' as MileageUnit,
    transmission: '',
    fuelType: '',
    location: '',
    condition: '',
    description: '',
  });

  const [error, setError] = useState('');

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const fullText = [form.title, form.description].join(' ');
    const flaggedPhrases = detectPhrases(fullText);

    const priceValue = parseFloat(form.priceRaw.replace(/[$,]/g, ''));

    const mileageValue = parseFloat(form.mileageRaw.replace(/[,\s]/g, ''));

    const data: ListingData = {
      listingId: null,
      url: form.url || window.location.href,
      title: form.title || null,
      price: {
        raw: form.priceRaw,
        value: isNaN(priceValue) ? null : priceValue,
        currency: form.priceCurrency,
        type: form.priceRaw ? 'asking' : 'not_found',
        excerpt: form.priceRaw,
      },
      year: parseInt(form.year) || null,
      make: form.make || null,
      model: form.model || null,
      mileage: {
        raw: form.mileageRaw,
        value: isNaN(mileageValue) ? null : mileageValue,
        unit: form.mileageUnit,
      },
      transmission: form.transmission || null,
      fuelType: form.fuelType || null,
      location: form.location || null,
      condition: form.condition || null,
      description: form.description || null,
      extractedAt: Date.now(),
      isManual: true,
      flaggedPhrases,
      suggestedQuestions: generateQuestions({
        mileage: { raw: form.mileageRaw, value: isNaN(mileageValue) ? null : mileageValue, unit: form.mileageUnit },
        price: { raw: form.priceRaw, value: isNaN(priceValue) ? null : priceValue, currency: form.priceCurrency, type: 'asking', excerpt: form.priceRaw },
        transmission: form.transmission || null,
        fuelType: form.fuelType || null,
        description: form.description || null,
        condition: form.condition || null,
        flaggedPhrases,
      }),
    };

    onComplete(data);
  };

  return (
    <form className="manual-form fade-in" onSubmit={handleSubmit}>
      <div className="alert alert-info">
        ✏️ Enter listing details manually. Saved listings and comparisons work with manual entries.
        Fields marked with * are recommended but not required.
      </div>

      <div className="form-row">
        <label>Listing URL</label>
        <input
          type="url"
          value={form.url}
          onChange={set('url')}
          placeholder="https://facebook.com/marketplace/item/..."
          id="manual-url"
        />
      </div>

      <div className="form-row">
        <label>Title *</label>
        <input value={form.title} onChange={set('title')} placeholder="e.g. 2019 Honda Civic LX" id="manual-title" />
      </div>

      <div className="form-row-inline">
        <div className="form-row">
          <label>Asking Price</label>
          <input value={form.priceRaw} onChange={set('priceRaw')} placeholder="e.g. 14500" id="manual-price" />
        </div>
        <div className="form-row">
          <label>Currency</label>
          <select value={form.priceCurrency} onChange={set('priceCurrency')} id="manual-currency">
            <option value="unknown">Unknown</option>
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div className="form-row-inline">
        <div className="form-row">
          <label>Year</label>
          <input value={form.year} onChange={set('year')} placeholder="2019" id="manual-year" />
        </div>
        <div className="form-row">
          <label>Make</label>
          <input value={form.make} onChange={set('make')} placeholder="Honda" id="manual-make" />
        </div>
      </div>

      <div className="form-row">
        <label>Model</label>
        <input value={form.model} onChange={set('model')} placeholder="Civic LX" id="manual-model" />
      </div>

      <div className="form-row-inline">
        <div className="form-row">
          <label>Mileage</label>
          <input value={form.mileageRaw} onChange={set('mileageRaw')} placeholder="e.g. 85000" id="manual-mileage" />
        </div>
        <div className="form-row">
          <label>Unit</label>
          <select value={form.mileageUnit} onChange={set('mileageUnit')} id="manual-unit">
            <option value="km">km</option>
            <option value="mi">miles</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
      </div>

      <div className="form-row-inline">
        <div className="form-row">
          <label>Transmission</label>
          <select value={form.transmission} onChange={set('transmission')} id="manual-trans">
            <option value="">Unknown</option>
            <option value="Automatic">Automatic</option>
            <option value="Manual">Manual</option>
            <option value="CVT">CVT</option>
          </select>
        </div>
        <div className="form-row">
          <label>Fuel Type</label>
          <select value={form.fuelType} onChange={set('fuelType')} id="manual-fuel">
            <option value="">Unknown</option>
            <option value="Gasoline">Gasoline</option>
            <option value="Diesel">Diesel</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Electric">Electric</option>
            <option value="Plug-in Hybrid">Plug-in Hybrid</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <label>Location</label>
        <input value={form.location} onChange={set('location')} placeholder="e.g. Toronto, ON" id="manual-location" />
      </div>

      <div className="form-row">
        <label>Title / Condition</label>
        <input value={form.condition} onChange={set('condition')} placeholder="e.g. Clean title, Rebuilt" id="manual-condition" />
      </div>

      <div className="form-row">
        <label>Seller Description *</label>
        <textarea
          value={form.description}
          onChange={set('description')}
          placeholder="Paste the seller's listing description here for phrase detection…"
          rows={5}
          id="manual-description"
        />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
          Analyze manually →
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Back
        </button>
      </div>
    </form>
  );
}
