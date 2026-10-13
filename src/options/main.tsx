import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/global.css';
import './options.css';
import OptionsApp from './OptionsApp';
import { getPreferences } from '../services/settings';
import { PAGE_LOCALE_KEY, detectLocale, getDir, getLocale, setLocale, t } from '../i18n';

const root = ReactDOM.createRoot(document.getElementById('root')!);

function render(): void {
  document.documentElement.lang = getLocale();
  document.documentElement.dir = getDir();
  document.title = t('options.pageTitle');
  root.render(
    <React.StrictMode>
      {/* Keyed by locale so every string re-renders after a language change */}
      <OptionsApp key={getLocale()} />
    </React.StrictMode>
  );
}

async function applyLanguage(): Promise<void> {
  const prefs = await getPreferences();
  let pageLang: string | null = null;
  try {
    const res = await chrome.storage.local.get(PAGE_LOCALE_KEY);
    pageLang = (res?.[PAGE_LOCALE_KEY] as string) ?? null;
  } catch {}
  // "Automatic" here follows the language of the marketplace the user browses, then the browser
  setLocale(detectLocale({ preference: prefs.language, pageLang, browserLangs: navigator.languages ?? [navigator.language] }));
  render();
}

applyLanguage();

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === 'local' && (changes['marketlens_preferences'] || changes[PAGE_LOCALE_KEY])) applyLanguage();
});
