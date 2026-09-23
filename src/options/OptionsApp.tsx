import React, { useState, useEffect, useCallback } from 'react';
import type { SavedListing, ListingStatus, FlagCategory } from '../types/listing';
import {
  getAllSaved,
  updateUserFields,
  deleteListing,
  clearAllListings,
} from '../storage/store';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ListingStatus, string> = {
  interested: 'Interested',
  contacted: 'Contacted',
  viewing_scheduled: 'Viewing Scheduled',
  archived: 'Archived',
};

const STATUS_CLASS: Record<ListingStatus, string> = {
  interested: 'status-interested',
  contacted: 'status-contacted',
  viewing_scheduled: 'status-viewing_scheduled',
  archived: 'status-archived',
};

const FLAG_ICONS: Record<FlagCategory, string> = {
  mechanical_concern: '🔧',
  title_disclosure: '📋',
  payment_ambiguity: '💰',
  inspection_condition: '🔍',
};

function vehicleLabel(s: SavedListing): string {
  const { year, make, model, title } = s.data;
  const parts = [year, make, model].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : title ?? 'Unnamed listing';
}

function priceDisplay(s: SavedListing): { text: string; unclear: boolean } {
  const p = s.data.price;
  if (p.type === 'not_found') return { text: 'Price not found', unclear: true };
  if (p.type === 'unclear') return { text: `Price unclear: ${p.raw}`, unclear: true };
  const curr = p.currency !== 'unknown' ? ` ${p.currency}` : '';
  const suffix = p.type === 'monthly' ? '/mo' : p.type === 'down_payment' ? ' (down)' : '';
  return { text: `${p.raw}${curr}${suffix}`, unclear: p.type !== 'asking' };
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  listing,
  onSave,
  onClose,
}: {
  listing: SavedListing;
  onSave: (notes: string, status: ListingStatus) => Promise<void>;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(listing.notes);
  const [status, setStatus] = useState<ListingStatus>(listing.status);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(notes, status);
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Edit: {vehicleLabel(listing)}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Your notes are kept separate from the extracted listing data.
        </p>
        <div className="form-row" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ListingStatus)}
            id="edit-status"
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Your personal notes about this listing…"
            rows={4}
            id="edit-notes"
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Saved Card ───────────────────────────────────────────────────────────────

function SavedCard({
  listing,
  index = 0,
  isSelectedForCompare,
  onToggleCompare,
  onEdit,
  onDelete,
}: {
  listing: SavedListing;
  index?: number;
  isSelectedForCompare: boolean;
  onToggleCompare: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const price = priceDisplay(listing);
  const label = vehicleLabel(listing);
  const flags = listing.data.flaggedPhrases;

  return (
    <div
      className={`saved-card ${isSelectedForCompare ? 'selected-for-compare' : ''}`}
      style={{ ['--i' as any]: index }}
    >
      <div className="saved-card-header">
        <div className="saved-card-title">{label}</div>
        <span className={`status-badge ${STATUS_CLASS[listing.status]}`}>
          {STATUS_LABELS[listing.status]}
        </span>
      </div>

      <div className={`saved-card-price ${price.unclear ? 'unclear' : ''}`}>
        {price.text}
      </div>

      <div className="saved-card-meta">
        {listing.data.mileage.value && (
          <span className="tag">
            {listing.data.mileage.value.toLocaleString()} {listing.data.mileage.unit}
          </span>
        )}
        {listing.data.transmission && <span className="tag">{listing.data.transmission}</span>}
        {listing.data.fuelType && <span className="tag">{listing.data.fuelType}</span>}
        {listing.data.location && <span className="tag">📍 {listing.data.location}</span>}
        {listing.data.isManual && <span className="tag" style={{ color: 'var(--accent)' }}>Manual entry</span>}
      </div>

      {flags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {flags.map((f, i) => (
            <span key={i} className="tag" title={f.excerpt} style={{ cursor: 'help', fontSize: 11 }}>
              {FLAG_ICONS[f.category]} {f.label}
            </span>
          ))}
        </div>
      )}

      {listing.notes && (
        <div className="saved-card-notes">{listing.notes}</div>
      )}

      {listing.priceHistory.length > 1 && (
        <div className="price-history-row">
          <span style={{ color: 'var(--text-muted)' }}>Price history:</span>
          {listing.priceHistory.map((ph, i) => (
            <span key={i} className="price-history-item" title={new Date(ph.timestamp).toLocaleString()}>
              {ph.raw}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        Saved {new Date(listing.savedAt).toLocaleDateString()}
        {listing.updatedAt !== listing.savedAt && (
          <> · Updated {new Date(listing.updatedAt).toLocaleDateString()}</>
        )}
      </div>

      <div className="saved-card-actions">
        <a
          href={listing.data.url}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost btn-sm"
        >
          ↗ View listing
        </a>
        <button className="btn btn-secondary btn-sm" onClick={onEdit} id={`edit-${listing.id}`}>
          ✏ Edit
        </button>
        <button
          className={`btn btn-sm ${isSelectedForCompare ? 'btn-primary' : 'btn-secondary'}`}
          onClick={onToggleCompare}
          id={`compare-${listing.id}`}
        >
          {isSelectedForCompare ? '✓ Comparing' : '⇄ Compare'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDelete} id={`delete-${listing.id}`}>
          🗑
        </button>
      </div>
    </div>
  );
}

// ─── Compare Table ────────────────────────────────────────────────────────────

function CompareTable({ listings }: { listings: SavedListing[] }) {
  const rows: Array<{ label: string; getValue: (s: SavedListing) => string }> = [
    { label: 'Price', getValue: (s) => priceDisplay(s).text },
    { label: 'Year', getValue: (s) => s.data.year?.toString() ?? 'Not mentioned' },
    { label: 'Make', getValue: (s) => s.data.make ?? 'Not mentioned' },
    { label: 'Model', getValue: (s) => s.data.model ?? 'Not mentioned' },
    {
      label: 'Mileage',
      getValue: (s) =>
        s.data.mileage.value
          ? `${s.data.mileage.value.toLocaleString()} ${s.data.mileage.unit}`
          : 'Not mentioned',
    },
    { label: 'Transmission', getValue: (s) => s.data.transmission ?? 'Not mentioned' },
    { label: 'Fuel Type', getValue: (s) => s.data.fuelType ?? 'Not mentioned' },
    { label: 'Location', getValue: (s) => s.data.location ?? 'Not mentioned' },
    { label: 'Condition', getValue: (s) => s.data.condition ?? 'Not mentioned' },
    {
      label: 'Items to Review',
      getValue: (s) =>
        s.data.flaggedPhrases.length > 0
          ? s.data.flaggedPhrases.map((f) => f.label).join(', ')
          : 'None detected',
    },
    {
      label: 'Missing Info',
      getValue: (s) => {
        const missing = [];
        if (!s.data.mileage.value) missing.push('mileage');
        if (!s.data.transmission) missing.push('transmission');
        if (!s.data.fuelType) missing.push('fuel type');
        if (!s.data.condition) missing.push('title/condition');
        return missing.length > 0 ? missing.join(', ') : 'None';
      },
    },
    { label: 'Your Notes', getValue: (s) => s.notes || '—' },
    { label: 'Status', getValue: (s) => STATUS_LABELS[s.status] },
  ];

  return (
    <div className="compare-container">
      <table className="compare-table">
        <thead>
          <tr>
            <th style={{ width: 140 }}>Field</th>
            {listings.map((s) => (
              <th key={s.id} className="vehicle-header">
                {vehicleLabel(s)}
                <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                  <a href={s.data.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                    View listing ↗
                  </a>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="row-label">{row.label}</td>
              {listings.map((s) => {
                const val = row.getValue(s);
                const isMuted = val === 'Not mentioned' || val === '—' || val === 'None';
                return (
                  <td key={s.id} className={`value-cell ${isMuted ? 'muted' : ''}`}>
                    {row.label === 'Price' ? (
                      <span className={`compare-price ${priceDisplay(s).unclear ? 'unclear' : ''}`}>
                        {val}
                      </span>
                    ) : (
                      val
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Options App ─────────────────────────────────────────────────────────

type View = 'saved' | 'compare';

export default function OptionsApp() {
  const [view, setView] = useState<View>('saved');
  const [listings, setListings] = useState<SavedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<SavedListing | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [clearConfirm, setClearConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await getAllSaved();
    // Sort newest first
    all.sort((a, b) => b.savedAt - a.savedAt);
    setListings(all);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = listings.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      vehicleLabel(s).toLowerCase().includes(q) ||
      s.data.location?.toLowerCase().includes(q) ||
      s.notes.toLowerCase().includes(q)
    );
  });

  const handleEdit = async (id: string, notes: string, status: ListingStatus) => {
    await updateUserFields(id, { notes, status });
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this saved listing?')) return;
    await deleteListing(id);
    setCompareIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    await load();
  };

  const handleClearAll = async () => {
    await clearAllListings();
    setCompareIds(new Set());
    setClearConfirm(false);
    await load();
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 5) {
        next.add(id);
      }
      return next;
    });
  };

  const compareListings = listings.filter((s) => compareIds.has(s.id));

  return (
    <div className="options-layout">
      {/* Header */}
      <div className="options-header">
        <div className="options-logo">
          <div className="options-logo-icon">✨</div>
          <div>
            <h1>MarketLens AI</h1>
            <span>Saved Listings & Comparisons</span>
          </div>
        </div>
        <div className="options-nav">
          <button
            className={`options-nav-btn ${view === 'saved' ? 'active' : ''}`}
            onClick={() => setView('saved')}
            id="nav-saved"
          >
            Saved ({listings.length})
          </button>
          <button
            className={`options-nav-btn ${view === 'compare' ? 'active' : ''}`}
            onClick={() => setView('compare')}
            id="nav-compare"
            disabled={compareIds.size < 2}
          >
            Compare {compareIds.size >= 2 ? `(${compareIds.size})` : ''}
          </button>
        </div>
      </div>

      {/* Saved View */}
      {view === 'saved' && (
        <>
          {listings.length > 0 && (
            <div className="page-toolbar">
              <div className="toolbar-left">
                <input
                  className="search-input"
                  type="search"
                  placeholder="Search saved vehicles…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  id="search-saved"
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {filtered.length} of {listings.length} listings
                </span>
              </div>
              <div>
                {compareIds.size >= 2 && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setView('compare')}
                    id="go-compare-btn"
                  >
                    ⇄ Compare {compareIds.size} vehicles
                  </button>
                )}
              </div>
            </div>
          )}

          {loading && (
            <div className="empty-state">
              <div className="spinner" />
              <p>Loading saved listings…</p>
            </div>
          )}

          {!loading && listings.length === 0 && (
            <div className="empty-state">
              <div className="icon">🚗</div>
              <h2>No saved listings yet</h2>
              <p>
                Open the extension on a Facebook Marketplace vehicle listing and click
                "Analyze this listing," then save it here.
              </p>
            </div>
          )}

          {!loading && filtered.length === 0 && listings.length > 0 && (
            <div className="empty-state">
              <div className="icon">🔎</div>
              <p>No listings match your search.</p>
              <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
                Clear search
              </button>
            </div>
          )}

          <div className="saved-grid">
            {filtered.map((s, i) => (
              <SavedCard
                key={s.id}
                listing={s}
                index={i}
                isSelectedForCompare={compareIds.has(s.id)}
                onToggleCompare={() => toggleCompare(s.id)}
                onEdit={() => setEditTarget(s)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>

          {/* Danger zone */}
          {listings.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <div className="divider" />
              <div className="danger-zone">
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>
                    Delete all saved data
                  </p>
                  <p>This permanently removes all {listings.length} saved listing(s) from local storage.</p>
                </div>
                {clearConfirm ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Are you sure?</span>
                    <button className="btn btn-danger btn-sm" onClick={handleClearAll} id="confirm-clear-all">
                      Yes, delete all
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setClearConfirm(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setClearConfirm(true)}
                    id="clear-all-btn"
                  >
                    Delete all
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Compare View */}
      {view === 'compare' && (
        <>
          <div className="page-toolbar">
            <div className="toolbar-left">
              <h2>Side-by-side comparison</h2>
              <span className="tag">{compareListings.length} vehicles</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setView('saved')}>
              ← Back to saved
            </button>
          </div>

          {compareListings.length < 2 ? (
            <div className="empty-state">
              <p>Select 2–5 saved listings to compare.</p>
              <button className="btn btn-primary btn-sm" onClick={() => setView('saved')}>
                ← Go to saved listings
              </button>
            </div>
          ) : (
            <>
              <div className="alert alert-info" style={{ marginBottom: 14, fontSize: 12 }}>
                ℹ Mileage values are shown in their original units. Prices are not ranked across
                currencies — no exchange rates are applied.
              </div>
              <CompareTable listings={compareListings} />
              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {compareListings.map((s) => (
                  <button
                    key={s.id}
                    className="btn btn-secondary btn-sm"
                    onClick={() => toggleCompare(s.id)}
                    id={`remove-compare-${s.id}`}
                  >
                    ✕ Remove {vehicleLabel(s)}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <EditModal
          listing={editTarget}
          onSave={(notes, status) => handleEdit(editTarget.id, notes, status)}
          onClose={() => { setEditTarget(null); }}
        />
      )}
    </div>
  );
}
