# Chrome Web Store Listing — MarketLens: AI Deal Checker for Facebook Marketplace

> The **name** and **summary** are read from the extension package
> (`public/_locales/<language>/messages.json`), so Chrome shows them in each
> user's language automatically. Only the **full description** (section 3,
> one file per language in `store-listing/`) is pasted into the Developer
> Dashboard.
>
> Keyword rules for this listing: keywords go where search gives them weight
> (name, summary, opening lines, section headings, FAQ questions) and read
> naturally everywhere. No keyword lists, no lists of brands or sites, no
> repeated phrases, no unattributed testimonials — Chrome Web Store review
> treats those as keyword spam ("Yellow Argon"), which this listing has
> already been flagged for once. Don't use the Facebook or Meta logo in
> screenshots or promo tiles.

---

## 1. Extension name (from the package)
```text
MarketLens: AI Deal Checker for Facebook Marketplace
```
*(52 characters — limit 75)*

---

## 2. Summary (from the package, ≤ 132 characters)
```text
Facebook Marketplace price checker & scam detector. See the fair price, spot red flags, check photos and send the right offer.
```
*(126 characters — shown under the name in Chrome Web Store search results)*

---

## 3. Full description (one file per language)

The full description is not part of the package, so it is pasted into the
Developer Dashboard once per language: **Store listing** → choose the
language in the dropdown at the top → paste the file into **Description**
→ **Save draft**. Each file is plain text, ready to paste as is.

| Dashboard language | Paste this file |
|---|---|
| English | [store-listing/en.txt](store-listing/en.txt) |
| Spanish | [store-listing/es.txt](store-listing/es.txt) |
| French | [store-listing/fr.txt](store-listing/fr.txt) |
| German | [store-listing/de.txt](store-listing/de.txt) |
| Portuguese (Brazil) and Portuguese (Portugal) | [store-listing/pt.txt](store-listing/pt.txt) |
| Russian | [store-listing/ru.txt](store-listing/ru.txt) |
| Arabic | [store-listing/ar.txt](store-listing/ar.txt) |
| Chinese (China) and Chinese (Taiwan) | [store-listing/zh.txt](store-listing/zh.txt) |
| Hindi | [store-listing/hi.txt](store-listing/hi.txt) |
| Bengali | [store-listing/bn.txt](store-listing/bn.txt) |

`pt.txt` is written in Brazilian Portuguese and `zh.txt` in Simplified
Chinese, matching the extension's own text for those locales.

All ten files share one structure and make the same claims, so when a
feature changes, update every file. Keep them accurate:

- eBay support covers eBay.com and eBay.ca only; other eBay country sites
  are not supported.
- Price-drop alerts show when the user returns to a saved listing; they are
  not push notifications.
- The first analysis is free; Pro is billed monthly or yearly.
- Never name the AI model or provider.
- Keep the Meta non-affiliation notice at the end.
- Use the extension's own button names in each language (the "Analyze"
  badge and the "Analyze deal" button).

`tests/i18n.test.ts` checks every file: present for each language, at most
16,000 characters, mentions Facebook Marketplace, carries the Meta notice,
uses the in-app button names and never mentions Gemini or Google. Have a
native speaker read each translation before publishing if you can.

---

## 4. What else moves the ranking

Chrome Web Store search weighs the name and summary most, then installs,
ratings, how many users keep the extension, and how recently it was updated.
The description helps people (and Google search) understand the listing, but
these move ranking more:

1. **Ratings and reviews.** Ask happy users for a review: a short in-app
   prompt after a good analysis is the most effective way.
2. **Screenshots.** Upload all 5 slots at 1280×800 showing the Buy Score,
   price check, scam warnings, counter-offer builder and saved-deals compare
   view. Screenshots drive install rate, which drives ranking.
3. **Localized listings.** Paste the matching `store-listing/` file for every
   language in the Developer Dashboard (section 3), so people browsing the
   store in that language read the listing in their own language. The name
   and summary are already translated in the package.
4. **Category and links.** Category: Shopping. Add a support email and a
   website or landing page URL.
5. **Regular updates.** Ship small improvements regularly; recently updated
   extensions are favored.
