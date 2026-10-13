/**
 * MarketLens AI — Stylesheet for the in-page drawer, floating button and feed badges.
 *
 * Everything is scoped under the drawer root id so it can't leak into the host
 * page, and element resets use the id to win over generic host-page rules.
 */

export function buildInpageStyles(BTN_ID: string, MODAL_ID: string): string {
  const M = `#${MODAL_ID}`;

  return `
    :root {
      --ml-accent: #0866FF;
      --ml-accent-hover: #1877F2;
      --ml-accent-soft: rgba(8, 102, 255, 0.15);
    }

    /* ── Floating launchers (live on the host page) ── */
    .ml-card-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 999;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 26px;
      padding: 0 10px 0 8px;
      margin: 0;
      background: rgba(17, 19, 24, 0.82);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      font: 600 11.5px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: background 0.15s ease, transform 0.15s ease;
      user-select: none;
      pointer-events: auto;
    }
    .ml-card-badge:hover { background: var(--ml-accent); border-color: transparent; }
    .ml-card-badge:active { transform: scale(0.97); }
    .ml-card-badge .ml-i { width: 13px; height: 13px; flex: none; }
    .ml-card-badge.has-score { padding: 0 10px 0 9px; font-variant-numeric: tabular-nums; font-size: 12px; }
    .ml-card-badge .ml-badge-dot { width: 7px; height: 7px; border-radius: 50%; background: #9aa1ad; flex: none; }
    .ml-card-badge[data-tone="positive"] .ml-badge-dot { background: #3DD68C; }
    .ml-card-badge[data-tone="warning"] .ml-badge-dot { background: #F5B544; }
    .ml-card-badge[data-tone="danger"] .ml-badge-dot { background: #F47174; }

    #${BTN_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483640;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 18px 0 14px;
      margin: 0;
      background: var(--ml-accent);
      color: #fff;
      border: 0;
      border-radius: 999px;
      font: 600 14px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.22);
      transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
      user-select: none;
    }
    #${BTN_ID}:hover { background: var(--ml-accent-hover); transform: translateY(-1px); }
    #${BTN_ID}:active { transform: translateY(0); }
    #${BTN_ID}:focus-visible, .ml-card-badge:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    #${BTN_ID} .ml-i { width: 18px; height: 18px; flex: none; }

    /* ── Design tokens ── */
    ${M} {
      display: none;
      --ml-bg: #0E0F12;
      --ml-surface: #16181C;
      --ml-surface-2: #1D2025;
      --ml-surface-3: #25282E;
      --ml-border: #2A2D34;
      --ml-border-strong: #3A3E47;
      --ml-text: #ECEDEF;
      --ml-text-2: #A3A8B3;
      --ml-text-3: #6E7480;
      --ml-accent-text: color-mix(in srgb, var(--ml-accent) 62%, #fff);
      --ml-accent-tint: color-mix(in srgb, var(--ml-accent) 16%, transparent);

      --ml-positive: #3DD68C;
      --ml-positive-soft: rgba(61, 214, 140, 0.12);
      --ml-warning: #F5B544;
      --ml-warning-soft: rgba(245, 181, 68, 0.12);
      --ml-danger: #F47174;
      --ml-danger-soft: rgba(244, 113, 116, 0.12);
      --ml-info: #8AB4FF;
      --ml-info-soft: rgba(138, 180, 255, 0.1);

      --ml-shadow-drawer: -24px 0 60px rgba(0, 0, 0, 0.45);
      --ml-shadow-card: none;
      --ml-skeleton: rgba(255, 255, 255, 0.06);
      --ml-skeleton-hi: rgba(255, 255, 255, 0.11);

      --ml-r-lg: 12px;
      --ml-r-md: 8px;
      --ml-ease: cubic-bezier(0.22, 1, 0.36, 1);
      --ml-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    ${M}[data-theme="light"] {
      --ml-bg: #F4F5F7;
      --ml-surface: #FFFFFF;
      --ml-surface-2: #F4F5F7;
      --ml-surface-3: #E9EBEF;
      --ml-border: #E3E5E9;
      --ml-border-strong: #CDD1D8;
      --ml-text: #111318;
      --ml-text-2: #4D5562;
      --ml-text-3: #868C98;
      --ml-accent-text: var(--ml-accent);
      --ml-accent-tint: color-mix(in srgb, var(--ml-accent) 10%, transparent);

      --ml-positive: #12A150;
      --ml-positive-soft: rgba(18, 161, 80, 0.1);
      --ml-warning: #B86E00;
      --ml-warning-soft: rgba(217, 119, 6, 0.11);
      --ml-danger: #D33A3A;
      --ml-danger-soft: rgba(211, 58, 58, 0.09);
      --ml-info: #2563EB;
      --ml-info-soft: rgba(37, 99, 235, 0.08);

      --ml-shadow-drawer: -24px 0 60px rgba(15, 18, 24, 0.16);
      --ml-shadow-card: 0 1px 2px rgba(15, 18, 24, 0.04);
      --ml-skeleton: rgba(15, 18, 24, 0.06);
      --ml-skeleton-hi: rgba(15, 18, 24, 0.1);
    }

    /* ── Reset (beats generic host-page element rules) ── */
    ${M}, ${M} * { box-sizing: border-box; }
    ${M} h1, ${M} h2, ${M} h3, ${M} h4, ${M} p, ${M} ol, ${M} ul, ${M} li {
      margin: 0;
      padding: 0;
      font: inherit;
      color: inherit;
      letter-spacing: inherit;
      list-style: none;
    }
    ${M} button {
      margin: 0;
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
      text-align: inherit;
      text-transform: none;
      letter-spacing: inherit;
      box-shadow: none;
      -webkit-appearance: none;
      appearance: none;
    }
    ${M} button:disabled { cursor: default; }
    ${M} img { display: block; max-width: 100%; }
    ${M} .ml-i { display: block; flex: none; }
    ${M} :focus-visible { outline: 2px solid var(--ml-accent); outline-offset: 2px; }

    /* ── Keyframes ── */
    @keyframes ml-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes ml-slide-in { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes ml-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes ml-spin { to { transform: rotate(360deg); } }
    @keyframes ml-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
    @keyframes ml-toast { 0% { opacity: 0; transform: translate(-50%, 6px); } 12%, 85% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, 0); } }

    /* ── Shell ── */
    ${M} .ml-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483645;
      display: flex;
      justify-content: flex-end;
      background: rgba(8, 10, 14, 0.42);
      animation: ml-fade 0.2s ease both;
    }
    ${M} .ml-drawer {
      position: relative;
      width: 420px;
      max-width: 100vw;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--ml-bg);
      color: var(--ml-text);
      border-left: 1px solid var(--ml-border);
      box-shadow: var(--ml-shadow-drawer);
      font-family: var(--ml-font);
      font-size: 13px;
      line-height: 1.5;
      text-align: left;
      -webkit-font-smoothing: antialiased;
      animation: ml-slide-in 0.28s var(--ml-ease) both;
      overflow: hidden;
    }

    /* ── Header ── */
    ${M} .ml-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      height: 56px;
      padding: 0 12px 0 16px;
      background: var(--ml-surface);
      border-bottom: 1px solid var(--ml-border);
      flex-shrink: 0;
    }
    ${M} .ml-header-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    ${M} .ml-brand-mark {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--ml-accent);
      color: #fff;
      display: grid;
      place-items: center;
      flex: none;
    }
    ${M} .ml-brand-name { font-size: 14px; font-weight: 650; letter-spacing: -0.01em; white-space: nowrap; }
    ${M} .ml-brand-name span { color: var(--ml-text-3); font-weight: 500; }
    ${M} .ml-header-actions { display: flex; align-items: center; gap: 2px; }
    ${M} .ml-icon-btn {
      width: 32px;
      height: 32px;
      border-radius: var(--ml-r-md);
      display: grid;
      place-items: center;
      color: var(--ml-text-2);
      transition: background 0.15s ease, color 0.15s ease;
    }
    ${M} .ml-icon-btn:hover, ${M} .ml-icon-btn.active { background: var(--ml-surface-2); color: var(--ml-text); }
    ${M} .ml-plan-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 10px;
      margin-right: 6px;
      border-radius: 999px;
      border: 1px solid var(--ml-border);
      background: var(--ml-surface);
      font-size: 12px;
      font-weight: 550;
      color: var(--ml-text-2);
      white-space: nowrap;
      transition: border-color 0.15s ease, color 0.15s ease;
    }
    ${M} .ml-plan-pill:empty { display: none; }
    ${M} .ml-plan-pill:hover { border-color: var(--ml-border-strong); color: var(--ml-text); }
    ${M} .ml-plan-pill .ml-i { width: 13px; height: 13px; }
    ${M} .ml-plan-pill.is-pro { color: var(--ml-accent-text); background: var(--ml-accent-tint); border-color: transparent; }
    ${M} .ml-plan-pill .ml-pill-upgrade { color: var(--ml-accent-text); }

    /* ── Body ── */
    ${M} .ml-drawer-body {
      flex: 1;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scrollbar-width: thin;
      scrollbar-color: var(--ml-border-strong) transparent;
    }
    ${M} .ml-drawer-body > * { flex-shrink: 0; }
    ${M} .ml-drawer-body::-webkit-scrollbar { width: 8px; }
    ${M} .ml-drawer-body::-webkit-scrollbar-thumb { background: var(--ml-border-strong); border-radius: 8px; border: 2px solid var(--ml-bg); }

    /* ── Section card ── */
    ${M} .ml-section {
      background: var(--ml-surface);
      border: 1px solid var(--ml-border);
      border-radius: var(--ml-r-lg);
      box-shadow: var(--ml-shadow-card);
      padding: 16px;
    }
    ${M} .ml-stagger { animation: ml-rise 0.35s var(--ml-ease) both; animation-delay: calc(var(--i, 0) * 45ms); }
    ${M} .ml-section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; min-height: 22px; }
    ${M} .ml-section-head > .ml-i { color: var(--ml-text-3); }
    ${M} .ml-section-title { font-size: 13px; font-weight: 600; color: var(--ml-text); }
    ${M} .ml-section-meta { margin-left: auto; display: flex; align-items: center; gap: 6px; }
    ${M} .ml-subhead {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--ml-text-3);
      margin: 14px 0 8px;
    }
    ${M} .ml-muted { color: var(--ml-text-2); }
    ${M} .ml-body-text { color: var(--ml-text-2); font-size: 13px; line-height: 1.55; }

    /* ── Badges / chips ── */
    ${M} .ml-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 600;
      white-space: nowrap;
      background: var(--ml-surface-2);
      color: var(--ml-text-2);
    }
    ${M} .ml-badge .ml-i { width: 12px; height: 12px; }
    ${M} .ml-badge::before { content: none; }
    ${M} .ml-badge.has-dot::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    ${M} .tone-positive { --tone: var(--ml-positive); --tone-soft: var(--ml-positive-soft); }
    ${M} .tone-warning { --tone: var(--ml-warning); --tone-soft: var(--ml-warning-soft); }
    ${M} .tone-danger { --tone: var(--ml-danger); --tone-soft: var(--ml-danger-soft); }
    ${M} .tone-info { --tone: var(--ml-info); --tone-soft: var(--ml-info-soft); }
    ${M} .tone-accent { --tone: var(--ml-accent-text); --tone-soft: var(--ml-accent-tint); }
    ${M} .ml-badge[class*="tone-"] { background: var(--tone-soft); color: var(--tone); }

    /* ── Notice ── */
    ${M} .ml-notice {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      border-radius: var(--ml-r-md);
      background: var(--tone-soft, var(--ml-surface-2));
      color: var(--ml-text);
      font-size: 12.5px;
      line-height: 1.5;
    }
    ${M} .ml-notice > .ml-i { color: var(--tone, var(--ml-text-2)); margin-top: 1px; }
    ${M} .ml-notice strong { font-weight: 600; }

    /* ── Hero / verdict ── */
    ${M} .ml-hero-product {
      font-size: 12px;
      color: var(--ml-text-2);
      margin-bottom: 12px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    ${M} .ml-hero-main { display: flex; align-items: center; gap: 16px; }
    ${M} .ml-score-ring { position: relative; width: 76px; height: 76px; flex: none; color: var(--tone); }
    ${M} .ml-score-ring svg { display: block; transform: rotate(-90deg); }
    ${M} .ml-score-ring-track { fill: none; stroke: var(--ml-surface-3); stroke-width: 6; }
    ${M} .ml-score-ring-fill {
      fill: none;
      stroke: currentColor;
      stroke-width: 6;
      stroke-linecap: round;
      transition: stroke-dashoffset 1s var(--ml-ease);
    }
    ${M} .ml-score-ring-center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    ${M} .ml-score-num { font-size: 24px; font-weight: 700; letter-spacing: -0.03em; color: var(--ml-text); font-variant-numeric: tabular-nums; }
    ${M} .ml-score-of { font-size: 10px; color: var(--ml-text-3); margin-top: 3px; font-weight: 500; }
    ${M} .ml-hero-verdict { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
    ${M} .ml-hero-title { font-size: 17px; font-weight: 650; line-height: 1.3; letter-spacing: -0.015em; color: var(--ml-text); }
    ${M} .ml-hero-summary { margin-top: 14px; color: var(--ml-text-2); font-size: 13px; line-height: 1.55; }
    ${M} .ml-keystats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin-top: 16px;
      border: 1px solid var(--ml-border);
      border-radius: var(--ml-r-md);
      overflow: hidden;
    }
    ${M} .ml-keystat { padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    ${M} .ml-keystat + .ml-keystat { border-left: 1px solid var(--ml-border); }
    ${M} .ml-keystat-label { font-size: 11px; color: var(--ml-text-3); font-weight: 500; white-space: nowrap; }
    ${M} .ml-keystat-value { font-size: 15px; font-weight: 650; color: var(--ml-text); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    ${M} .ml-keystat-value.is-accent { color: var(--ml-accent-text); }

    /* ── Price range chart ── */
    ${M} .ml-range { padding: 26px 2px 0; }
    ${M} .ml-range-track { position: relative; height: 8px; border-radius: 999px; background: var(--ml-surface-3); }
    ${M} .ml-range-band { position: absolute; top: 0; bottom: 0; border-radius: 999px; background: var(--ml-positive); opacity: 0.55; min-width: 6px; }
    ${M} .ml-range-tick { position: absolute; top: -4px; width: 2px; height: 16px; margin-left: -1px; border-radius: 1px; background: var(--ml-text-3); }
    ${M} .ml-range-marker {
      position: absolute;
      top: 50%;
      width: 16px;
      height: 16px;
      margin: -8px 0 0 -8px;
      border-radius: 50%;
      background: var(--ml-surface);
      border: 4px solid var(--ml-text);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    }
    ${M} .ml-range-label {
      position: absolute;
      bottom: calc(100% + 8px);
      transform: translateX(-50%);
      font-size: 11.5px;
      font-weight: 600;
      white-space: nowrap;
      color: var(--ml-text);
      font-variant-numeric: tabular-nums;
    }
    ${M} .ml-range-label.align-start { transform: translateX(-8px); }
    ${M} .ml-range-label.align-end { transform: translateX(calc(-100% + 8px)); }
    ${M} .ml-range-legend { display: flex; gap: 14px; margin-top: 12px; font-size: 11.5px; color: var(--ml-text-3); }
    ${M} .ml-range-legend span { display: inline-flex; align-items: center; gap: 6px; }
    ${M} .ml-legend-swatch { width: 10px; height: 6px; border-radius: 3px; background: var(--ml-positive); opacity: 0.55; }
    ${M} .ml-legend-tick { width: 2px; height: 10px; border-radius: 1px; background: var(--ml-text-3); }
    ${M} .ml-legend-dot { width: 8px; height: 8px; border-radius: 50%; border: 2px solid var(--ml-text); }

    ${M} .ml-kv { margin-top: 14px; border-top: 1px solid var(--ml-border); }
    ${M} .ml-kv-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--ml-border); }
    ${M} .ml-kv-row:last-child { border-bottom: 0; padding-bottom: 0; }
    ${M} .ml-kv-key { color: var(--ml-text-2); }
    ${M} .ml-kv-val { font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; color: var(--ml-text); }
    ${M} .ml-kv-val small { font-size: 12px; font-weight: 500; color: var(--ml-text-3); margin-left: 6px; }

    /* ── Lists (flags, findings, questions) ── */
    ${M} .ml-list { display: flex; flex-direction: column; gap: 8px; }
    ${M} .ml-flag {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      border-radius: var(--ml-r-md);
      background: var(--tone-soft);
      color: var(--ml-text);
      font-size: 12.5px;
      line-height: 1.5;
    }
    ${M} .ml-flag > .ml-i { color: var(--tone); margin-top: 1px; }
    ${M} .ml-bullets { display: flex; flex-direction: column; gap: 6px; }
    ${M} .ml-bullets li { position: relative; display: flex; gap: 8px; align-items: flex-start; color: var(--ml-text); font-size: 12.5px; line-height: 1.5; }
    ${M} .ml-bullets li > .ml-i { margin-top: 2px; color: var(--ml-text-3); width: 14px; height: 14px; }
    ${M} .ml-bullets.is-check li > .ml-i { color: var(--ml-positive); }
    ${M} .ml-bullets .ml-dot { width: 14px; height: 18px; flex: none; position: relative; }
    ${M} .ml-bullets .ml-dot::after { content: ''; position: absolute; left: 5px; top: 7px; width: 5px; height: 5px; border-radius: 50%; background: var(--ml-text-3); }

    ${M} .ml-questions { counter-reset: mlq; display: flex; flex-direction: column; }
    ${M} .ml-questions li { display: flex; gap: 10px; padding: 9px 0; border-top: 1px solid var(--ml-border); font-size: 12.5px; line-height: 1.5; color: var(--ml-text); }
    ${M} .ml-questions li:first-child { border-top: 0; padding-top: 0; }
    ${M} .ml-q-num { flex: none; width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 11px; font-weight: 600; background: var(--ml-surface-2); color: var(--ml-text-2); }

    /* ── Condition media row ── */
    ${M} .ml-media { display: flex; gap: 12px; align-items: center; }
    ${M} .ml-media-thumb { width: 56px; height: 56px; border-radius: var(--ml-r-md); object-fit: cover; background: var(--ml-surface-2); border: 1px solid var(--ml-border); flex: none; }
    ${M} .ml-media-info { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    ${M} .ml-media-title { font-weight: 600; color: var(--ml-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    ${M} .ml-media-sub { font-size: 12px; color: var(--ml-text-3); }
    ${M} .ml-auth { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; color: var(--tone); margin-top: 2px; }
    ${M} .ml-auth .ml-i { width: 13px; height: 13px; }
    ${M} .ml-media + .ml-body-text { margin-top: 12px; }

    /* ── Counter-offer ── */
    ${M} .ml-message {
      padding: 12px 14px;
      border-radius: var(--ml-r-md);
      background: var(--ml-surface-2);
      border-left: 3px solid var(--ml-accent);
      font-size: 13px;
      line-height: 1.6;
      color: var(--ml-text);
      white-space: pre-wrap;
    }
    ${M} .ml-message + .ml-btn { margin-top: 12px; }

    /* ── Stats grid ── */
    ${M} .ml-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    ${M} .ml-stat { padding: 10px 12px; border-radius: var(--ml-r-md); background: var(--ml-surface-2); display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    ${M} .ml-stat-label { font-size: 11px; color: var(--ml-text-3); font-weight: 500; }
    ${M} .ml-stat-value { font-size: 14px; font-weight: 650; color: var(--ml-text); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    ${M} .ml-stat-value.is-positive { color: var(--ml-positive); }
    ${M} .ml-stat-value.is-negative { color: var(--ml-danger); }
    ${M} .ml-stats + .ml-notice, ${M} .ml-stats + .ml-body-text, ${M} .ml-notice + .ml-body-text { margin-top: 12px; }

    ${M} .ml-disclaimer { text-align: center; font-size: 11.5px; color: var(--ml-text-3); padding: 4px 12px 8px; line-height: 1.5; }

    /* ── Buttons ── */
    ${M} .ml-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 38px;
      padding: 0 14px;
      border-radius: var(--ml-r-md);
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
    }
    ${M} .ml-btn.is-block { width: 100%; }
    ${M} .ml-btn.is-sm { height: 28px; padding: 0 10px; font-size: 12px; gap: 6px; }
    ${M} .ml-btn.is-sm .ml-i { width: 14px; height: 14px; }
    ${M} .ml-btn-primary { background: var(--ml-accent); color: #fff; }
    ${M} .ml-btn-primary:hover:not(:disabled) { background: var(--ml-accent-hover); }
    ${M} .ml-btn-secondary { background: var(--ml-surface); color: var(--ml-text); border: 1px solid var(--ml-border-strong); }
    ${M} .ml-btn-secondary:hover:not(:disabled) { background: var(--ml-surface-2); }
    ${M} .ml-btn-ghost { color: var(--ml-text-2); }
    ${M} .ml-btn-ghost:hover:not(:disabled) { background: var(--ml-surface-2); color: var(--ml-text); }
    ${M} .ml-btn-link { color: var(--ml-accent-text); height: auto; padding: 4px 6px; font-weight: 550; }
    ${M} .ml-btn-link:hover { text-decoration: underline; }
    ${M} .ml-btn:disabled { opacity: 0.6; }
    ${M} .ml-btn.is-done { background: var(--ml-positive-soft); color: var(--ml-positive); border-color: transparent; }

    /* ── Loading ── */
    ${M} .ml-loading-status { display: flex; gap: 12px; align-items: flex-start; padding: 4px 2px 6px; }
    ${M} .ml-spinner {
      width: 18px;
      height: 18px;
      flex: none;
      border-radius: 50%;
      border: 2px solid var(--ml-surface-3);
      border-top-color: var(--ml-accent);
      animation: ml-spin 0.8s linear infinite;
      margin-top: 1px;
    }
    ${M} .ml-loading-title { font-size: 14px; font-weight: 600; color: var(--ml-text); }
    ${M} .ml-loading-sub { font-size: 12.5px; color: var(--ml-text-2); margin-top: 2px; }
    ${M} .ml-skel {
      display: block;
      height: 12px;
      border-radius: 6px;
      background: linear-gradient(90deg, var(--ml-skeleton) 0%, var(--ml-skeleton-hi) 50%, var(--ml-skeleton) 100%);
      background-size: 200% 100%;
      animation: ml-shimmer 1.4s ease-in-out infinite;
    }
    ${M} .ml-skel + .ml-skel { margin-top: 10px; }
    ${M} .ml-skel-row { display: flex; gap: 16px; align-items: center; }
    ${M} .ml-skel-circle { width: 76px; height: 76px; border-radius: 50%; flex: none; }
    ${M} .ml-skel-col { flex: 1; }

    /* ── Empty / guide state ── */
    ${M} .ml-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 28px 8px 8px; }
    ${M} .ml-empty-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: var(--ml-surface);
      border: 1px solid var(--ml-border);
      color: var(--ml-text-2);
      margin-bottom: 16px;
    }
    ${M} .ml-empty-icon.tone-positive, ${M} .ml-empty-icon.tone-danger { background: var(--tone-soft); color: var(--tone); border-color: transparent; }
    ${M} .ml-empty-title { font-size: 17px; font-weight: 650; letter-spacing: -0.015em; color: var(--ml-text); }
    ${M} .ml-empty-sub { margin-top: 6px; color: var(--ml-text-2); max-width: 320px; line-height: 1.55; }
    ${M} .ml-steps { width: 100%; margin-top: 24px; text-align: left; }
    ${M} .ml-step { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--ml-border); }
    ${M} .ml-step:first-child { border-top: 0; }
    ${M} .ml-step-num { width: 24px; height: 24px; border-radius: 50%; flex: none; display: grid; place-items: center; font-size: 12px; font-weight: 600; background: var(--ml-surface-2); color: var(--ml-text-2); border: 1px solid var(--ml-border); }
    ${M} .ml-step-title { font-weight: 600; color: var(--ml-text); }
    ${M} .ml-step-desc { color: var(--ml-text-2); font-size: 12.5px; margin-top: 1px; }
    ${M} .ml-empty-actions { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; margin-top: 20px; }
    ${M} .ml-supported { margin-top: 16px; font-size: 12px; color: var(--ml-text-3); }
    ${M} .ml-error-msg {
      margin-top: 14px;
      width: 100%;
      padding: 10px 12px;
      border-radius: var(--ml-r-md);
      background: var(--ml-surface-2);
      color: var(--ml-text-2);
      font-size: 12px;
      text-align: left;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    /* ── Paywall ── */
    ${M} .ml-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--ml-accent-text); }
    ${M} .ml-eyebrow .ml-i { width: 14px; height: 14px; }
    ${M} .ml-paywall-title { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; margin-top: 8px; color: var(--ml-text); line-height: 1.25; }
    ${M} .ml-paywall-sub { margin-top: 6px; color: var(--ml-text-2); line-height: 1.55; }
    ${M} .ml-plans { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 18px; }
    ${M} .ml-plan {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px;
      border-radius: var(--ml-r-md);
      border: 1px solid var(--ml-border-strong);
      background: var(--ml-surface);
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    ${M} .ml-plan:hover { border-color: var(--ml-text-3); }
    ${M} .ml-plan.active { border-color: var(--ml-accent); box-shadow: 0 0 0 1px var(--ml-accent); background: var(--ml-accent-tint); }
    ${M} .ml-plan-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px; }
    ${M} .ml-plan-name { font-size: 12.5px; font-weight: 600; color: var(--ml-text); }
    ${M} .ml-plan-radio { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--ml-border-strong); flex: none; }
    ${M} .ml-plan.active .ml-plan-radio { border: 5px solid var(--ml-accent); }
    ${M} .ml-plan-price { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--ml-text); font-variant-numeric: tabular-nums; }
    ${M} .ml-plan-price small { font-size: 12px; font-weight: 500; color: var(--ml-text-3); letter-spacing: 0; }
    ${M} .ml-plan-note { font-size: 11.5px; color: var(--ml-text-3); }
    ${M} .ml-plan-save { position: absolute; top: -9px; right: 10px; height: 18px; padding: 0 7px; border-radius: 999px; background: var(--ml-positive); color: #fff; font-size: 10.5px; font-weight: 650; display: inline-flex; align-items: center; }
    ${M}[data-theme="dark"] .ml-plan-save { color: #0B2A1A; }
    ${M} .ml-features { margin: 18px 0; display: flex; flex-direction: column; gap: 10px; }
    ${M} .ml-features li { display: flex; gap: 10px; align-items: flex-start; color: var(--ml-text-2); font-size: 12.5px; line-height: 1.5; }
    ${M} .ml-features li strong { color: var(--ml-text); font-weight: 600; }
    ${M} .ml-features .ml-i { color: var(--ml-positive); margin-top: 2px; width: 15px; height: 15px; }
    ${M} .ml-fineprint { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 12px; font-size: 11.5px; color: var(--ml-text-3); }
    ${M} .ml-fineprint .ml-i { width: 12px; height: 12px; }
    ${M} .ml-center { display: flex; justify-content: center; }
    ${M} .ml-checkout-err { margin-bottom: 10px; }
    ${M} .ml-awaiting { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: var(--ml-r-md); background: var(--ml-surface-2); }
    ${M} .ml-awaiting-head { display: flex; gap: 10px; align-items: flex-start; }
    ${M} .ml-awaiting-title { font-weight: 600; color: var(--ml-text); }
    ${M} .ml-awaiting-sub { font-size: 12px; color: var(--ml-text-2); margin-top: 1px; }

    /* ── Settings ── */
    ${M} .ml-subheader { display: flex; align-items: center; gap: 8px; margin: -4px 0 0; }
    ${M} .ml-subheader-title { font-size: 15px; font-weight: 650; color: var(--ml-text); }
    ${M} .ml-settings-group { padding: 0; overflow: hidden; }
    ${M} .ml-settings-group-title { padding: 14px 16px 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ml-text-3); }
    ${M} .ml-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; }
    ${M} .ml-setting-row + .ml-setting-row { border-top: 1px solid var(--ml-border); }
    ${M} .ml-setting-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    ${M} .ml-setting-name { font-weight: 550; color: var(--ml-text); }
    ${M} .ml-setting-sub { font-size: 12px; color: var(--ml-text-2); line-height: 1.45; }
    ${M} .ml-setting-stack { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
    ${M} .ml-setting-stack + .ml-setting-stack { border-top: 1px solid var(--ml-border); }

    ${M} .ml-switch { position: relative; display: inline-block; width: 36px; height: 20px; flex: none; cursor: pointer; }
    ${M} .ml-switch input { position: absolute; opacity: 0; width: 0; height: 0; margin: 0; }
    ${M} .ml-slider { position: absolute; inset: 0; border-radius: 999px; background: var(--ml-surface-3); border: 1px solid var(--ml-border-strong); transition: background 0.18s ease, border-color 0.18s ease; }
    ${M} .ml-slider::before { content: ''; position: absolute; width: 14px; height: 14px; left: 2px; top: 2px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.25); transition: transform 0.18s var(--ml-ease); }
    ${M} .ml-switch input:checked + .ml-slider { background: var(--ml-accent); border-color: var(--ml-accent); }
    ${M} .ml-switch input:checked + .ml-slider::before { transform: translateX(16px); }
    ${M} .ml-switch input:focus-visible + .ml-slider { outline: 2px solid var(--ml-accent); outline-offset: 2px; }

    ${M} .ml-segmented { display: grid; grid-template-columns: repeat(3, 1fr); padding: 3px; gap: 3px; border-radius: var(--ml-r-md); background: var(--ml-surface-2); border: 1px solid var(--ml-border); }
    ${M} .ml-theme-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 30px; border-radius: 6px; font-size: 12.5px; font-weight: 550; color: var(--ml-text-2); transition: background 0.15s ease, color 0.15s ease; }
    ${M} .ml-theme-btn .ml-i { width: 14px; height: 14px; }
    ${M} .ml-theme-btn:hover { color: var(--ml-text); }
    ${M} .ml-theme-btn.active { background: var(--ml-surface); color: var(--ml-text); box-shadow: 0 1px 2px rgba(0,0,0,0.12), 0 0 0 1px var(--ml-border); }
    ${M} .ml-color-swatches { display: flex; gap: 10px; }
    ${M} .ml-swatch { width: 24px; height: 24px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12); transition: transform 0.15s ease; }
    ${M} .ml-swatch:hover { transform: scale(1.08); }
    ${M} .ml-swatch.active { box-shadow: 0 0 0 2px var(--ml-surface), 0 0 0 4px var(--ml-text); }

    ${M} .ml-toast {
      position: absolute;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--ml-text);
      color: var(--ml-bg);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      z-index: 2;
      box-shadow: 0 6px 20px rgba(0,0,0,0.2);
    }
    ${M} .ml-toast .ml-i { width: 14px; height: 14px; }
    ${M} .ml-toast.show { animation: ml-toast 1.8s ease both; }

    /* ── Results toolbar ── */
    ${M} .ml-toolbar { display: flex; align-items: center; gap: 6px; }
    ${M} .ml-toolbar-meta { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--ml-text-3); white-space: nowrap; }
    ${M} .ml-toolbar-meta .ml-i { width: 13px; height: 13px; }
    ${M} .ml-icon-btn.is-sm { width: 28px; height: 28px; }
    ${M} .ml-btn-secondary.is-active { color: var(--ml-accent-text); border-color: color-mix(in srgb, var(--ml-accent) 45%, transparent); background: var(--ml-accent-tint); }
    ${M} #ml-price-change-slot:empty { display: none; }

    /* ── Counter-offer builder ── */
    ${M} .ml-offer-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    ${M} .ml-stepper { display: inline-flex; align-items: center; border: 1px solid var(--ml-border-strong); border-radius: var(--ml-r-md); overflow: hidden; background: var(--ml-surface); }
    ${M} .ml-stepper-btn { width: 32px; height: 34px; display: grid; place-items: center; color: var(--ml-text-2); transition: background 0.15s ease, color 0.15s ease; }
    ${M} .ml-stepper-btn:hover { background: var(--ml-surface-2); color: var(--ml-text); }
    ${M} .ml-stepper-value { min-width: 76px; text-align: center; font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--ml-text); border-left: 1px solid var(--ml-border); border-right: 1px solid var(--ml-border); line-height: 34px; padding: 0 8px; }
    ${M} .ml-offer-delta { font-size: 12px; color: var(--ml-positive); font-weight: 550; }
    ${M} .ml-offer-delta.is-over { color: var(--ml-warning); }
    ${M} .ml-tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
    ${M} .ml-tab { height: 28px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 550; color: var(--ml-text-2); border: 1px solid var(--ml-border); background: var(--ml-surface); transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
    ${M} .ml-tab:hover:not(:disabled) { color: var(--ml-text); border-color: var(--ml-border-strong); }
    ${M} .ml-tab.active, ${M} .ml-tab.active:hover { background: var(--ml-text); border-color: var(--ml-text); color: var(--ml-bg); }
    ${M} .ml-tab:disabled { opacity: 0.45; }

    /* ── Keyboard hints ── */
    ${M} .ml-kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 20px;
      padding: 0 5px;
      border-radius: 5px;
      border: 1px solid var(--ml-border-strong);
      border-bottom-width: 2px;
      background: var(--ml-surface);
      color: var(--ml-text-2);
      font: 600 11px/1 var(--ml-font);
    }
    ${M} .ml-kbd-group { display: inline-flex; gap: 4px; flex: none; }
    ${M} .ml-tip { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; }
    ${M} .ml-tip > span { display: inline-flex; align-items: center; gap: 3px; flex-wrap: wrap; justify-content: center; }

    /* ── Small screens ── */
    @media (max-width: 480px) {
      ${M} .ml-drawer { width: 100vw; border-left: 0; }
      ${M} .ml-keystat-value { font-size: 14px; }
    }

    @media (prefers-reduced-motion: reduce) {
      ${M} *, .ml-card-badge, #${BTN_ID} { animation: none !important; transition: none !important; }
    }
  `;
}
