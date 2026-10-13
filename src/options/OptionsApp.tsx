import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  WATCHLIST_KEY,
  WATCH_STATUS_LABELS,
  clearWatchlist,
  getWatchlist,
  priceChangeSinceSaved,
  removeFromWatchlist,
  updateWatchItem,
  watchlistToCsv,
  type WatchStatus,
  type WatchlistItem,
} from '../storage/watchlist';
import { SITE_LABELS } from '../utils/listing';
import { money, timeAgo } from '../utils/format';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUSES = Object.keys(WATCH_STATUS_LABELS) as WatchStatus[];
const MAX_COMPARE = 5;

type SortKey = 'recent' | 'score' | 'price_asc' | 'price_drop';

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Recently saved',
  score: 'Best buy score',
  price_asc: 'Lowest price',
  price_drop: 'Biggest price drop',
};

const VERDICT_TEXT: Record<string, string> = {
  buy_now: 'Buy now',
  good_buy: 'Good buy',
  negotiate: 'Negotiate',
  caution: 'Caution',
  walk_away: 'Walk away',
};

function scoreTone(score: number): 'positive' | 'warning' | 'danger' {
  if (score >= 70) return 'positive';
  if (score >= 45) return 'warning';
  return 'danger';
}

/** Only allow web links from stored data. */
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : '#';
}

function itemPrice(item: WatchlistItem): string {
  if (typeof item.price === 'number') return money(item.price);
  return item.priceRaw || 'No price';
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  logo: 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0M21 21l-5-5M8 11l2 2 4-4',
  external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  compare: 'M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7',
  check: 'M20 6 9 17l-5-5',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  bookmark: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z',
  search: 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0M21 21l-4.3-4.3',
  back: 'm12 19-7-7 7-7M19 12H5',
  x: 'M18 6 6 18M6 6l12 12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM21 15l-5-5L5 21M10 8.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0',
  down: 'M22 17 13.5 8.5 8.5 13.5 2 7M16 17h6v-6',
  up: 'M22 7 13.5 15.5 8.5 10.5 2 17M16 7h6v6',
};

function Thumb({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="wl-thumb wl-thumb-empty">
        <Icon d={ICONS.image} />
      </div>
    );
  }
  return <img className="wl-thumb" src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function PriceChangeBadge({ item }: { item: WatchlistItem }) {
  const change = priceChangeSinceSaved(item);
  if (!change) return null;
  const dropped = change.delta < 0;
  return (
    <span
      className={`pill ${dropped ? 'tone-positive' : 'tone-warning'}`}
      title={`${dropped ? 'Dropped' : 'Up'} from ${money(change.from)} when you saved it`}
    >
      <Icon d={dropped ? ICONS.down : ICONS.up} />
      {money(Math.abs(change.delta))}
    </span>
  );
}

function ScorePill({ item }: { item: WatchlistItem }) {
  const score = item.analysis?.buyScore;
  if (typeof score !== 'number') return <span className="pill">Not analyzed</span>;
  const rounded = Math.round(score);
  const verdict = item.analysis?.buyVerdict ? VERDICT_TEXT[item.analysis.buyVerdict] : null;
  return (
    <span className={`pill has-dot tone-${scoreTone(rounded)}`} title={item.analysis?.buyVerdictLabel}>
      {rounded}
      {verdict ? ` · ${verdict}` : ''}
    </span>
  );
}

// ─── Notes Modal ──────────────────────────────────────────────────────────────

function NotesModal({
  item,
  onSave,
  onClose,
}: {
  item: WatchlistItem;
  onSave: (notes: string, status: WatchStatus) => Promise<void>;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(item.notes);
  const [status, setStatus] = useState<WatchStatus>(item.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(notes, status);
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="notes-title">
        <h2 id="notes-title">{item.title}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 18 }}>
          Notes are stored only on this device.
        </p>
        <div className="form-row" style={{ marginBottom: 14 }}>
          <label className="form-label" htmlFor="edit-status">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as WatchStatus)} id="edit-status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{WATCH_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="edit-notes">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Seller name, pickup details, questions to ask…"
            rows={5}
            id="edit-notes"
            autoFocus
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
  item,
  index,
  isSelectedForCompare,
  compareFull,
  onToggleCompare,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  item: WatchlistItem;
  index: number;
  isSelectedForCompare: boolean;
  compareFull: boolean;
  onToggleCompare: () => void;
  onEdit: () => void;
  onStatusChange: (status: WatchStatus) => void;
  onDelete: () => void;
}) {
  const fair = item.analysis?.pricing?.fairUsedMarketRange;
  const offer = item.analysis?.negotiation?.recommendedOffer;

  return (
    <div className={`saved-card ${isSelectedForCompare ? 'selected-for-compare' : ''}`} style={{ ['--i' as any]: index }}>
      <div className="wl-head">
        <Thumb src={item.imageUrl} />
        <div className="wl-head-text">
          <a className="wl-title" href={safeUrl(item.url)} target="_blank" rel="noreferrer" title={item.title}>
            {item.title}
          </a>
          <div className="wl-sub">
            {SITE_LABELS[item.site] ?? 'Web'} · saved {timeAgo(item.savedAt)}
          </div>
        </div>
        <div className="wl-head-actions">
          <a className="btn btn-ghost btn-sm" href={safeUrl(item.url)} target="_blank" rel="noreferrer" title="Open listing" aria-label="Open listing">
            <Icon d={ICONS.external} />
          </a>
          <button className="btn btn-ghost btn-sm" onClick={onDelete} id={`delete-${item.id}`} title="Remove" aria-label="Remove">
            <Icon d={ICONS.trash} />
          </button>
        </div>
      </div>

      <div className="wl-price-row">
        <span className="saved-card-price">{itemPrice(item)}</span>
        <PriceChangeBadge item={item} />
        <span className="wl-spacer" />
        <ScorePill item={item} />
      </div>

      {(fair || offer) && (
        <div className="wl-facts">
          {fair && (
            <div>
              <span>Fair value</span>
              <strong>{money(fair.min)} – {money(fair.max)}</strong>
            </div>
          )}
          {offer ? (
            <div>
              <span>Suggested offer</span>
              <strong>{money(offer)}</strong>
            </div>
          ) : null}
        </div>
      )}

      {item.notes && <div className="saved-card-notes">{item.notes}</div>}

      <div className="saved-card-actions wl-actions">
        <select
          className="wl-status-select"
          value={item.status}
          onChange={(e) => onStatusChange(e.target.value as WatchStatus)}
          aria-label="Status"
          id={`status-${item.id}`}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{WATCH_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={onEdit} id={`edit-${item.id}`}>
          <Icon d={ICONS.edit} />
          Notes
        </button>
        <button
          className={`btn btn-sm ${isSelectedForCompare ? 'btn-primary' : 'btn-secondary'}`}
          onClick={onToggleCompare}
          id={`compare-${item.id}`}
          aria-pressed={isSelectedForCompare}
          disabled={!isSelectedForCompare && compareFull}
          title={!isSelectedForCompare && compareFull ? `You can compare up to ${MAX_COMPARE} listings` : undefined}
        >
          <Icon d={isSelectedForCompare ? ICONS.check : ICONS.compare} />
          {isSelectedForCompare ? 'Comparing' : 'Compare'}
        </button>
      </div>
    </div>
  );
}

// ─── Compare Table ────────────────────────────────────────────────────────────

interface CompareRow {
  label: string;
  render: (i: WatchlistItem) => ReactNode;
  muted?: (i: WatchlistItem) => boolean;
}

function CompareTable({ items }: { items: WatchlistItem[] }) {
  const scores = items.map((i) => i.analysis?.buyScore).filter((s): s is number => typeof s === 'number');
  const bestScore = scores.length > 1 ? Math.max(...scores) : null;
  const prices = items.map((i) => i.price).filter((p): p is number => typeof p === 'number');
  const lowestPrice = prices.length > 1 ? Math.min(...prices) : null;

  const rows: CompareRow[] = [
    {
      label: 'Price',
      render: (i) => (
        <span className="compare-price">
          {itemPrice(i)}
          {lowestPrice !== null && i.price === lowestPrice && <span className="pill tone-positive">Lowest</span>}
        </span>
      ),
    },
    {
      label: 'Since saved',
      render: (i) => (priceChangeSinceSaved(i) ? <PriceChangeBadge item={i} /> : 'No change'),
      muted: (i) => !priceChangeSinceSaved(i),
    },
    {
      label: 'Buy score',
      render: (i) => (
        <span className="compare-inline">
          <ScorePill item={i} />
          {bestScore !== null && i.analysis?.buyScore === bestScore && <span className="pill tone-accent">Best</span>}
        </span>
      ),
    },
    { label: 'Verdict', render: (i) => i.analysis?.buyVerdictLabel || '—', muted: (i) => !i.analysis?.buyVerdictLabel },
    {
      label: 'Fair used range',
      render: (i) => {
        const f = i.analysis?.pricing?.fairUsedMarketRange;
        return f ? `${money(f.min)} – ${money(f.max)} (avg ${money(f.fairAverage)})` : '—';
      },
      muted: (i) => !i.analysis?.pricing?.fairUsedMarketRange,
    },
    {
      label: 'Suggested offer',
      render: (i) => (i.analysis?.negotiation?.recommendedOffer ? money(i.analysis.negotiation.recommendedOffer) : '—'),
      muted: (i) => !i.analysis?.negotiation?.recommendedOffer,
    },
    {
      label: 'Retail when new',
      render: (i) => (i.analysis?.pricing?.estimatedNewPrice ? money(i.analysis.pricing.estimatedNewPrice) : '—'),
      muted: (i) => !i.analysis?.pricing?.estimatedNewPrice,
    },
    {
      label: 'Condition',
      render: (i) => {
        const c = i.analysis?.visualAudit?.conditionScore;
        return c ? c.charAt(0).toUpperCase() + c.slice(1) : '—';
      },
      muted: (i) => !i.analysis?.visualAudit?.conditionScore,
    },
    {
      label: 'Risk flags',
      render: (i) => {
        if (!i.analysis) return '—';
        const flags = i.analysis.redFlags ?? [];
        if (flags.length === 0) return 'None found';
        return (
          <ul className="compare-list">
            {flags.map((f, n) => (
              <li key={n} className={`sev-${f.severity}`}>{f.text}</li>
            ))}
          </ul>
        );
      },
      muted: (i) => !i.analysis,
    },
    { label: 'Site', render: (i) => SITE_LABELS[i.site] ?? 'Web' },
    { label: 'Status', render: (i) => WATCH_STATUS_LABELS[i.status] },
    { label: 'Your notes', render: (i) => i.notes || '—', muted: (i) => !i.notes },
  ];

  return (
    <div className="compare-container">
      <table className="compare-table">
        <thead>
          <tr>
            <th style={{ width: 140 }} />
            {items.map((i) => (
              <th key={i.id} className="vehicle-header">
                <div className="compare-head">
                  <Thumb src={i.imageUrl} />
                  <div>
                    <div className="compare-head-title">{i.title}</div>
                    <a href={safeUrl(i.url)} target="_blank" rel="noreferrer">Open listing</a>
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="row-label">{row.label}</td>
              {items.map((i) => (
                <td key={i.id} className={`value-cell ${row.muted?.(i) ? 'muted' : ''}`}>
                  {row.render(i)}
                </td>
              ))}
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
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WatchStatus | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [editTarget, setEditTarget] = useState<WatchlistItem | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [clearConfirm, setClearConfirm] = useState(false);

  const load = useCallback(async () => {
    const all = await getWatchlist().catch(() => [] as WatchlistItem[]);
    setItems(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Stay in sync when listings are saved from the drawer in another tab
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[WATCHLIST_KEY]) load();
    };
    chrome.storage?.onChanged?.addListener(onChanged);
    return () => chrome.storage?.onChanged?.removeListener(onChanged);
  }, [load]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const s of STATUSES) counts[s] = items.filter((i) => i.status === s).length;
    return counts;
  }, [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        i.notes.toLowerCase().includes(q) ||
        (i.analysis?.identifiedProduct?.category ?? '').toLowerCase().includes(q)
      );
    });

    const delta = (i: WatchlistItem) => priceChangeSinceSaved(i)?.delta ?? 0;
    const sorted = [...filtered];
    if (sort === 'score') sorted.sort((a, b) => (b.analysis?.buyScore ?? -1) - (a.analysis?.buyScore ?? -1));
    else if (sort === 'price_asc') sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    else if (sort === 'price_drop') sorted.sort((a, b) => delta(a) - delta(b));
    else sorted.sort((a, b) => b.savedAt - a.savedAt);
    return sorted;
  }, [items, search, statusFilter, sort]);

  const handleEdit = async (id: string, notes: string, status: WatchStatus) => {
    await updateWatchItem(id, { notes, status });
    await load();
  };

  const handleStatus = async (id: string, status: WatchStatus) => {
    await updateWatchItem(id, { status });
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this listing from your saved list?')) return;
    await removeFromWatchlist(id);
    setCompareIds((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    await load();
  };

  const handleClearAll = async () => {
    await clearWatchlist();
    setCompareIds(new Set());
    setClearConfirm(false);
    await load();
  };

  const handleExport = () => {
    const blob = new Blob([watchlistToCsv(visible)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marketlens-saved-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
  };

  const compareItems = items.filter((i) => compareIds.has(i.id));

  return (
    <div className="options-layout">
      <div className="options-header">
        <div className="options-logo">
          <div className="options-logo-icon"><Icon d={ICONS.logo} /></div>
          <div>
            <h1>MarketLens AI</h1>
            <span>Saved listings</span>
          </div>
        </div>
        <div className="options-nav">
          <button className={`options-nav-btn ${view === 'saved' ? 'active' : ''}`} onClick={() => setView('saved')} id="nav-saved">
            Saved{items.length > 0 ? ` · ${items.length}` : ''}
          </button>
          <button
            className={`options-nav-btn ${view === 'compare' ? 'active' : ''}`}
            onClick={() => setView('compare')}
            id="nav-compare"
            disabled={compareIds.size < 2}
            title={compareIds.size < 2 ? 'Select 2 or more listings to compare' : undefined}
          >
            Compare{compareIds.size >= 2 ? ` · ${compareIds.size}` : ''}
          </button>
        </div>
      </div>

      {view === 'saved' && (
        <>
          {items.length > 0 && (
            <>
              <div className="page-toolbar">
                <div className="toolbar-left">
                  <input
                    className="search-input"
                    type="search"
                    placeholder="Search title, notes or category…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    id="search-saved"
                  />
                  <select className="wl-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort" id="sort-saved">
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                      <option key={k} value={k}>{SORT_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div className="toolbar-left">
                  {compareIds.size >= 2 && (
                    <button className="btn btn-primary btn-sm" onClick={() => setView('compare')} id="go-compare-btn">
                      <Icon d={ICONS.compare} />
                      Compare {compareIds.size}
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={handleExport} id="export-csv-btn" disabled={visible.length === 0}>
                    <Icon d={ICONS.download} />
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="wl-filters" role="tablist" aria-label="Filter by status">
                {(['all', ...STATUSES] as Array<WatchStatus | 'all'>).map((s) => (
                  <button
                    key={s}
                    role="tab"
                    aria-selected={statusFilter === s}
                    className={`wl-filter ${statusFilter === s ? 'active' : ''}`}
                    onClick={() => setStatusFilter(s)}
                    disabled={s !== 'all' && statusCounts[s] === 0 && statusFilter !== s}
                  >
                    {s === 'all' ? 'All' : WATCH_STATUS_LABELS[s]}
                    <span className="wl-filter-count">{statusCounts[s]}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {loading && (
            <div className="empty-state">
              <div className="spinner" />
              <p>Loading saved listings…</p>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="empty-state">
              <div className="icon"><Icon d={ICONS.bookmark} /></div>
              <h2>No saved listings yet</h2>
              <p>
                Analyze a listing on Facebook Marketplace, eBay or Craigslist, then click <strong>Save</strong> in the
                MarketLens drawer. Saved listings track price drops and can be compared side by side.
              </p>
            </div>
          )}

          {!loading && items.length > 0 && visible.length === 0 && (
            <div className="empty-state">
              <div className="icon"><Icon d={ICONS.search} /></div>
              <p>No saved listings match these filters.</p>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setStatusFilter('all'); }}>
                Clear filters
              </button>
            </div>
          )}

          <div className="saved-grid">
            {visible.map((item, i) => (
              <SavedCard
                key={item.id}
                item={item}
                index={i}
                isSelectedForCompare={compareIds.has(item.id)}
                compareFull={compareIds.size >= MAX_COMPARE}
                onToggleCompare={() => toggleCompare(item.id)}
                onEdit={() => setEditTarget(item)}
                onStatusChange={(s) => handleStatus(item.id, s)}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>

          {items.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <div className="danger-zone">
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Delete all saved listings</p>
                  <p>Permanently removes {items.length} saved {items.length === 1 ? 'listing' : 'listings'} and their notes from this device.</p>
                </div>
                {clearConfirm ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Are you sure?</span>
                    <button className="btn btn-danger btn-sm" onClick={handleClearAll} id="confirm-clear-all">Yes, delete all</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setClearConfirm(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-danger btn-sm" onClick={() => setClearConfirm(true)} id="clear-all-btn">Delete all</button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {view === 'compare' && (
        <>
          <div className="page-toolbar">
            <div className="toolbar-left">
              <h2>Side-by-side comparison</h2>
              <span className="tag">{compareItems.length} listings</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setView('saved')}>
              <Icon d={ICONS.back} />
              Back to saved
            </button>
          </div>

          {compareItems.length < 2 ? (
            <div className="empty-state">
              <p>Select 2–{MAX_COMPARE} saved listings to compare.</p>
              <button className="btn btn-primary btn-sm" onClick={() => setView('saved')}>Go to saved listings</button>
            </div>
          ) : (
            <>
              <CompareTable items={compareItems} />
              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {compareItems.map((i) => (
                  <button key={i.id} className="btn btn-secondary btn-sm" onClick={() => toggleCompare(i.id)} id={`remove-compare-${i.id}`}>
                    <Icon d={ICONS.x} />
                    Remove {i.title.length > 32 ? `${i.title.slice(0, 30)}…` : i.title}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {editTarget && (
        <NotesModal
          item={editTarget}
          onSave={(notes, status) => handleEdit(editTarget.id, notes, status)}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
