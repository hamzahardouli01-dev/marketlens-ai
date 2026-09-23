/**
 * MarketLens AI — Universal Extractor Unit Tests
 *
 * Validates DOM extraction across simulated Facebook Marketplace,
 * eBay, Craigslist, and other secondhand listing DOM structures.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  extractUniversalPrice,
  extractUniversalTitle,
  extractUniversalDescription,
  extractUniversalImages,
  isIndividualListing,
  isMarketplacePage,
  getListingRoot,
} from '../src/content/universalExtractor';

describe('Universal Extractor — Price Extraction', () => {
  it('extracts standard USD price', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div>
        <h1>Apple iPhone 13 Pro 128GB</h1>
        <span class="x193iq5w">$450</span>
      </div>
    `;
    const { priceRaw, currency } = extractUniversalPrice(div);
    expect(priceRaw).toBe('$450');
    expect(currency).toBe('USD');
  });

  it('extracts Canadian Dollar price with CA$ prefix', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div>
        <h1>2019 MacBook Pro 16</h1>
        <span class="x193iq5w">CA$ 750</span>
      </div>
    `;
    const { priceRaw, currency } = extractUniversalPrice(div);
    expect(priceRaw).toMatch(/CA\$\s*750/);
    expect(currency).toBe('CAD');
  });

  it('extracts European currency price with suffix symbol and non-breaking space', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div>
        <h1>Sony PlayStation 5 Disc Edition</h1>
        <span>380\u00A0€</span>
      </div>
    `;
    const { priceRaw, currency } = extractUniversalPrice(div);
    expect(priceRaw).toContain('380');
    expect(currency).toBe('EUR');
  });

  it('extracts Free listing as $0 (Free)', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div>
        <h1>Free Wooden Pallets</h1>
        <span>Free</span>
      </div>
    `;
    const { priceRaw } = extractUniversalPrice(div);
    expect(priceRaw).toBe('$0 (Free)');
  });

  it('handles split spans for currency and amount', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="x193iq5w">
        <span>$</span>
        <span>1,200</span>
      </div>
    `;
    const { priceRaw } = extractUniversalPrice(div);
    expect(priceRaw).toBe('$1,200');
  });

  it('extracts price from OpenGraph metadata if DOM element is absent', () => {
    const doc = document.implementation.createHTMLDocument();
    const metaPrice = doc.createElement('meta');
    metaPrice.setAttribute('property', 'product:price:amount');
    metaPrice.setAttribute('content', '299.99');
    doc.head.appendChild(metaPrice);

    const metaCurr = doc.createElement('meta');
    metaCurr.setAttribute('property', 'product:price:currency');
    metaCurr.setAttribute('content', 'USD');
    doc.head.appendChild(metaCurr);

    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const { priceRaw, currency } = extractUniversalPrice(container, doc);
    expect(priceRaw).toBe('$299.99');
    expect(currency).toBe('USD');
  });
});

describe('Universal Extractor — Title Extraction', () => {
  it('extracts h1 title cleanly', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div>
        <h1>2021 Apple iPad Air 4th Gen 64GB WiFi</h1>
      </div>
    `;
    expect(extractUniversalTitle(div)).toBe('2021 Apple iPad Air 4th Gen 64GB WiFi');
  });

  it('strips Facebook notification counter and site branding from document.title', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.title = '(2) Herman Miller Aeron Chair - Furniture | Facebook Marketplace | Facebook';
    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const title = extractUniversalTitle(container, doc);
    expect(title).toBe('Herman Miller Aeron Chair - Furniture');
  });

  it('extracts prominent details span if h1 is absent', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div role="main">
        <span dir="auto">Bose QuietComfort 45 Headphones</span>
        <span>$180</span>
      </div>
    `;
    expect(extractUniversalTitle(div)).toBe('Bose QuietComfort 45 Headphones');
  });
});

describe('Universal Extractor — Description Extraction', () => {
  it('extracts description beneath "Seller\'s description" header in nested structures', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div>
        <div>
          <h2>Seller's description</h2>
        </div>
        <div>
          <div dir="auto">
            <span>Selling my lightly used iPad. Comes with original box and Apple Pencil 2. Battery health is at 94%. No scratches or dents.</span>
            <span>See more</span>
          </div>
        </div>
      </div>
    `;
    const desc = extractUniversalDescription(div);
    expect(desc).toContain('Selling my lightly used iPad');
    expect(desc).toContain('Apple Pencil 2');
    expect(desc).not.toContain('Seller\'s description');
  });

  it('extracts French "Description du vendeur"', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div>
        <div>
          <span>Description du vendeur</span>
        </div>
        <div>
          <div dir="auto">
            <span>Vélo de route Trek Emonda ALR 5 en excellent état. Moins de 1000 km parcourus. Tout équipé Shimano 105.</span>
          </div>
        </div>
      </div>
    `;
    const desc = extractUniversalDescription(div);
    expect(desc).toContain('Vélo de route Trek Emonda ALR 5');
  });

  it('extracts eBay item description selector', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div data-testid="x-item-description">
        Authentic vintage leather jacket. Size Medium. Heavyweight brass zippers and quilted lining.
      </div>
    `;
    const desc = extractUniversalDescription(div);
    expect(desc).toContain('Authentic vintage leather jacket');
  });

  it('extracts Craigslist #postingbody cleanly', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <section id="postingbody">
        QR Code Link to This Post
        Solid oak dining table with 4 matching chairs. Great condition, pick up in Mission district.
      </section>
    `;
    const desc = extractUniversalDescription(div);
    expect(desc).toContain('Solid oak dining table with 4 matching chairs');
    expect(desc).not.toContain('QR Code Link');
  });
});

describe('Universal Extractor — Image Extraction', () => {
  it('extracts Facebook Marketplace hero photo and excludes avatars', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div role="main">
        <!-- User avatar (should be ignored) -->
        <img src="https://scontent.xx.fbcdn.net/v/avatar123.jpg?alt=profile" alt="Seller profile" width="40" height="40" />
        <!-- Product photo -->
        <div aria-label="Photo 1 of 3">
          <img
            data-visualcompletion="media-vc-image"
            src="https://scontent-sea1-1.xx.fbcdn.net/v/t45.5328-4/hero_macbook.jpg"
            alt="2021 MacBook Pro"
            width="600"
            height="600"
          />
        </div>
      </div>
    `;
    const { imageUrl } = extractUniversalImages(div);
    expect(imageUrl).toContain('hero_macbook.jpg');
    expect(imageUrl).not.toContain('avatar123');
  });

  it('extracts eBay hero image from #icImg', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div>
        <img id="icImg" src="https://i.ebayimg.com/images/g/abc123/s-l1600.jpg" width="800" height="800" />
      </div>
    `;
    const { imageUrl } = extractUniversalImages(div);
    expect(imageUrl).toBe('https://i.ebayimg.com/images/g/abc123/s-l1600.jpg');
  });
});

describe('Universal Extractor — Container Isolation', () => {
  it('ignores messenger/chat dialog and targets genuine listing dialog', () => {
    const doc = document.implementation.createHTMLDocument();

    // 1. Chat dialog (should be ignored!)
    const chatDialog = doc.createElement('div');
    chatDialog.setAttribute('role', 'dialog');
    chatDialog.setAttribute('aria-label', 'Chats');
    chatDialog.innerHTML = `
      <span>John Doe</span>
      <p>Hey, is this still available?</p>
    `;
    doc.body.appendChild(chatDialog);

    // 2. Genuine Marketplace listing dialog
    const listingDialog = doc.createElement('div');
    listingDialog.setAttribute('role', 'dialog');
    listingDialog.setAttribute('aria-label', 'Marketplace listing');
    listingDialog.innerHTML = `
      <h1>Canon EOS R6 Camera Body</h1>
      <span class="x193iq5w">$1,450</span>
      <img src="https://scontent.xx.fbcdn.net/v/camera.jpg" width="500" height="500" />
      <div>
        <h2>Seller's description</h2>
        <div dir="auto"><span>Like new condition with shutter count under 5k.</span></div>
      </div>
    `;
    doc.body.appendChild(listingDialog);

    const root = getListingRoot(doc);
    expect(root).toBe(listingDialog);

    const title = extractUniversalTitle(root, doc);
    expect(title).toBe('Canon EOS R6 Camera Body');

    const { priceRaw } = extractUniversalPrice(root, doc);
    expect(priceRaw).toBe('$1,450');

    const desc = extractUniversalDescription(root, doc);
    expect(desc).toContain('Like new condition with shutter count under 5k');
  });
});

describe('Universal Extractor — isMarketplacePage Validation', () => {
  it('identifies valid marketplace URLs', () => {
    // Facebook Marketplace
    expect(isMarketplacePage('https://www.facebook.com/marketplace')).toBe(true);
    expect(isMarketplacePage('https://www.facebook.com/marketplace/')).toBe(true);
    expect(isMarketplacePage('https://www.facebook.com/marketplace/item/9876543210/')).toBe(true);
    expect(isMarketplacePage('https://www.facebook.com/marketplace/category/vehicles')).toBe(true);
    expect(isMarketplacePage('https://web.facebook.com/marketplace/')).toBe(true);

    // eBay
    expect(isMarketplacePage('https://www.ebay.com/itm/123456789012')).toBe(true);
    expect(isMarketplacePage('https://www.ebay.com/sch/i.html?_nkw=laptop')).toBe(true);

    // Craigslist
    expect(isMarketplacePage('https://sfbay.craigslist.org/sfc/cto/d/car/123.html')).toBe(true);
    expect(isMarketplacePage('https://sfbay.craigslist.org/search/sss')).toBe(true);

    // Other supported secondhand marketplaces
    expect(isMarketplacePage('https://offerup.com/item/detail/12345')).toBe(true);
    expect(isMarketplacePage('https://poshmark.com/listing/dress-12345')).toBe(true);
    expect(isMarketplacePage('https://mercari.com/item/m12345')).toBe(true);
  });

  it('strictly rejects non-marketplace pages and non-marketplace areas of Facebook', () => {
    // Facebook News Feed, Groups, Messenger, Profile (NOT marketplace)
    expect(isMarketplacePage('https://www.facebook.com/')).toBe(false);
    expect(isMarketplacePage('https://www.facebook.com/groups/123456789/')).toBe(false);
    expect(isMarketplacePage('https://www.facebook.com/messages/t/123')).toBe(false);
    expect(isMarketplacePage('https://www.facebook.com/watch/')).toBe(false);
    expect(isMarketplacePage('https://www.facebook.com/profile.php?id=1000')).toBe(false);

    // Craigslist help/about/forums
    expect(isMarketplacePage('https://www.craigslist.org/about/help')).toBe(false);
    expect(isMarketplacePage('https://forums.craigslist.org/')).toBe(false);

    // Non-marketplace domains
    expect(isMarketplacePage('https://www.google.com/search?q=used+cars')).toBe(false);
    expect(isMarketplacePage('https://www.youtube.com/watch?v=12345')).toBe(false);
    expect(isMarketplacePage('https://github.com/trending')).toBe(false);
    expect(isMarketplacePage('https://twitter.com/home')).toBe(false);
  });
});

describe('Universal Extractor — isIndividualListing Validation', () => {
  it('correctly identifies direct listing URLs', () => {
    expect(isIndividualListing('https://www.facebook.com/marketplace/item/9876543210/')).toBe(true);
    expect(isIndividualListing('https://www.ebay.com/itm/123456789012')).toBe(true);
    expect(isIndividualListing('https://sfbay.craigslist.org/sfc/cto/d/san-francisco-2015-honda-civic/7891011121.html')).toBe(true);
    expect(isIndividualListing('https://poshmark.com/listing/Lululemon-Align-Pant-25-612345678')).toBe(true);
    expect(isIndividualListing('https://mercari.com/item/m1234567890')).toBe(true);
    expect(isIndividualListing('https://offerup.com/item/detail/12345678')).toBe(true);
  });

  it('correctly rejects general feed, search results, and category pages', () => {
    // Facebook browse feeds
    expect(isIndividualListing('https://www.facebook.com/marketplace/')).toBe(false);
    expect(isIndividualListing('https://www.facebook.com/marketplace/category/vehicles')).toBe(false);
    expect(isIndividualListing('https://www.facebook.com/marketplace/search/?query=macbook')).toBe(false);

    // Facebook social pages outside marketplace
    expect(isIndividualListing('https://www.facebook.com/')).toBe(false);
    expect(isIndividualListing('https://www.facebook.com/groups/hondacivic/')).toBe(false);

    // eBay search and category pages
    expect(isIndividualListing('https://www.ebay.com/sch/i.html?_nkw=macbook+pro')).toBe(false);
    expect(isIndividualListing('https://www.ebay.com/b/Laptops-Netbooks/175672/bn_1648275')).toBe(false);

    // Craigslist search
    expect(isIndividualListing('https://sfbay.craigslist.org/search/sfc/sss?query=camera')).toBe(false);

    // Non-marketplace domains
    expect(isIndividualListing('https://www.google.com/search?q=used+cars')).toBe(false);
    expect(isIndividualListing('https://www.youtube.com/watch?v=12345')).toBe(false);
  });
});

