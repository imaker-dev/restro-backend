/**
 * Test: image_url prefix with APP_URL
 * Verifies all endpoints return full URLs for image_url/imageUrl/img fields
 */

require('dotenv').config();
const axios = require('axios');
const { initializeDatabase } = require('../database');
const appConfig = require('../config/app.config');

const BASE = 'http://localhost:3000/api/v1';
const OUTLET_ID = 4;
const APP_URL = appConfig.url || 'http://localhost:3000';

let passed = 0, failed = 0, api;

function section(t) { console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`); }
function test(name, cond, detail) {
  if (cond) { passed++; console.log(`   ✓ ${name}`); }
  else { failed++; console.log(`   ✗ FAIL: ${name}${detail ? ' → ' + detail : ''}`); }
}

function isFullUrl(url) {
  if (!url) return true; // null/empty is OK (no image set)
  return url.startsWith('http://') || url.startsWith('https://');
}

function isRelativePath(url) {
  return url && !url.startsWith('http://') && !url.startsWith('https://');
}

async function login(email, password) {
  const res = await axios.post(`${BASE}/auth/login`, { email, password });
  const token = res.data.data.accessToken || res.data.data.token;
  return axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } });
}

(async () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Image URL Prefix Test — APP_URL applied everywhere      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`   APP_URL: ${APP_URL}`);

  await initializeDatabase();
  api = await login('admin@restropos.com', 'admin123');

  // ═══════════════════════════════════════
  // 1. GET /menu/items/outlet/:outletId
  // ═══════════════════════════════════════
  section('1. Items by Outlet — /menu/items/outlet/:outletId');
  try {
    const r = await api.get(`/menu/items/outlet/${OUTLET_ID}`);
    test('Status 200', r.status === 200);
    const items = r.data.data;
    test('Has items', items.length > 0);

    const withImg = items.filter(i => i.image_url);
    if (withImg.length > 0) {
      const allFull = withImg.every(i => isFullUrl(i.image_url));
      test('All image_url are full URLs', allFull,
        allFull ? '' : `Found relative: ${withImg.find(i => isRelativePath(i.image_url))?.image_url}`);
      test(`image_url starts with APP_URL`, withImg[0].image_url.startsWith(APP_URL),
        withImg[0].image_url);
      console.log(`   Sample: ${withImg[0].image_url}`);
    } else {
      console.log('   (no items have images set)');
      // Check items without images are null
      test('Items without images return null', items.every(i => i.image_url === null || isFullUrl(i.image_url)));
    }
  } catch (e) {
    test('Items by outlet', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════
  // 2. GET /menu/items/category/:categoryId
  // ═══════════════════════════════════════
  section('2. Items by Category — /menu/items/category/:categoryId');
  try {
    // Get first category
    const cats = await api.get(`/menu/categories/outlet/${OUTLET_ID}`);
    const catId = cats.data.data[0]?.id;
    if (catId) {
      const r = await api.get(`/menu/items/category/${catId}`);
      test('Status 200', r.status === 200);
      const items = r.data.data;
      const withImg = items.filter(i => i.image_url);
      if (withImg.length > 0) {
        test('All image_url are full URLs', withImg.every(i => isFullUrl(i.image_url)));
        console.log(`   Sample: ${withImg[0].image_url}`);
      } else {
        test('No relative paths', items.every(i => !isRelativePath(i.image_url)));
      }
    }
  } catch (e) {
    test('Items by category', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════
  // 3. Categories — image_url
  // ═══════════════════════════════════════
  section('3. Categories — /menu/categories/outlet/:outletId');
  try {
    const r = await api.get(`/menu/categories/outlet/${OUTLET_ID}`);
    test('Status 200', r.status === 200);
    const cats = r.data.data;
    const withImg = cats.filter(c => c.image_url);
    if (withImg.length > 0) {
      test('All category image_url are full URLs', withImg.every(c => isFullUrl(c.image_url)));
      console.log(`   Sample: ${withImg[0].image_url}`);
    } else {
      test('No relative paths in categories', cats.every(c => !isRelativePath(c.image_url)));
    }
  } catch (e) {
    test('Categories', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════
  // 4. Captain Menu — imageUrl / img
  // ═══════════════════════════════════════
  section('4. Captain Menu — /menu/captain/:outletId');
  try {
    const r = await api.get(`/menu/${OUTLET_ID}/captain`);
    test('Status 200', r.status === 200);
    const menu = r.data.data.menu || [];

    // Check category images
    const catWithImg = menu.filter(c => c.img);
    if (catWithImg.length > 0) {
      test('Captain cat img are full URLs', catWithImg.every(c => isFullUrl(c.img)));
    }

    // Check item images
    const allItems = menu.flatMap(c => c.items || []);
    const itemsWithImg = allItems.filter(i => i.img);
    if (itemsWithImg.length > 0) {
      test('Captain item img are full URLs', itemsWithImg.every(i => isFullUrl(i.img)));
      console.log(`   Sample item img: ${itemsWithImg[0].img}`);
    }

    // Check addon images
    const allAddons = allItems.flatMap(i => (i.addons || []).flatMap(g => g.options || []));
    const addonsWithImg = allAddons.filter(a => a.img);
    if (addonsWithImg.length > 0) {
      test('Captain addon img are full URLs', addonsWithImg.every(a => isFullUrl(a.img)));
    }
  } catch (e) {
    test('Captain menu', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════
  // 5. Full Menu (buildMenu) — imageUrl
  // ═══════════════════════════════════════
  section('5. Full Menu — /menu/:outletId');
  try {
    const r = await api.get(`/menu/${OUTLET_ID}`);
    test('Status 200', r.status === 200);
    const cats = r.data.data.categories || [];

    // Category imageUrl
    const catWithImg = cats.filter(c => c.imageUrl);
    if (catWithImg.length > 0) {
      test('Menu category imageUrl are full URLs', catWithImg.every(c => isFullUrl(c.imageUrl)));
    }

    // Item imageUrl
    const allItems = cats.flatMap(c => c.items || []);
    const itemsWithImg = allItems.filter(i => i.imageUrl);
    if (itemsWithImg.length > 0) {
      test('Menu item imageUrl are full URLs', itemsWithImg.every(i => isFullUrl(i.imageUrl)));
      console.log(`   Sample item imageUrl: ${itemsWithImg[0].imageUrl}`);
    }
  } catch (e) {
    test('Full menu', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════
  // 6. Search — img
  // ═══════════════════════════════════════
  section('6. Search — /menu/search/:outletId');
  try {
    const r = await api.get(`/menu/${OUTLET_ID}/search?q=a`);
    test('Status 200', r.status === 200);

    // Matching items
    const items = r.data.data.matchingItems || [];
    const itemsWithImg = items.filter(i => i.img);
    if (itemsWithImg.length > 0) {
      test('Search item img are full URLs', itemsWithImg.every(i => isFullUrl(i.img)));
      console.log(`   Sample search item img: ${itemsWithImg[0].img}`);
    }

    // Matching categories
    const cats = r.data.data.matchingCategories || [];
    const catWithImg = cats.filter(c => c.img);
    if (catWithImg.length > 0) {
      test('Search category img are full URLs', catWithImg.every(c => isFullUrl(c.img)));
    }

    // Category items
    const catItems = cats.flatMap(c => c.items || []);
    const catItemsWithImg = catItems.filter(i => i.img);
    if (catItemsWithImg.length > 0) {
      test('Search cat-item img are full URLs', catItemsWithImg.every(i => isFullUrl(i.img)));
    }
  } catch (e) {
    test('Search', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════
  // 7. Single Item by ID
  // ═══════════════════════════════════════
  section('7. Single Item — /menu/items/:id');
  try {
    // Get an item with image
    const allItems = await api.get(`/menu/items/outlet/${OUTLET_ID}`);
    const itemWithImg = allItems.data.data.find(i => i.image_url);
    if (itemWithImg) {
      const r = await api.get(`/menu/items/${itemWithImg.id}`);
      test('Status 200', r.status === 200);
      test('Single item image_url is full URL', isFullUrl(r.data.data.image_url));
      console.log(`   image_url: ${r.data.data.image_url}`);
    } else {
      console.log('   (no items with images to test)');
    }
  } catch (e) {
    test('Single item', false, e.response?.data?.message || e.message);
  }

  // ═══════════════════════════════════════
  // 8. Table detail (items with imageUrl)
  // ═══════════════════════════════════════
  section('8. Table Detail — /tables/:outletId (occupied)');
  try {
    const r = await api.get(`/tables/outlet/${OUTLET_ID}?status=occupied`);
    if (r.status === 200) {
      const tables = r.data.data || [];
      // Find a table with items
      let foundItems = false;
      for (const t of tables) {
        if (t.currentOrder?.items?.length > 0) {
          const itemsWithImg = t.currentOrder.items.filter(i => i.imageUrl);
          if (itemsWithImg.length > 0) {
            test('Table item imageUrl is full URL', isFullUrl(itemsWithImg[0].imageUrl));
            console.log(`   Sample: ${itemsWithImg[0].imageUrl}`);
            foundItems = true;
            break;
          }
        }
      }
      if (!foundItems) {
        console.log('   (no occupied tables with item images to test)');
      }
    }
  } catch (e) {
    // Tables endpoint may vary
    console.log(`   (skipped: ${e.response?.data?.message || e.message})`);
  }

  // ═══════════════════════════════════════
  // 9. Takeaway detail (imageUrl)
  // ═══════════════════════════════════════
  section('9. Takeaway Order Detail');
  try {
    // Find a takeaway order
    const r = await api.get(`/orders/takeaway/pending/${OUTLET_ID}`);
    const orders = r.data.data || [];
    if (orders.length > 0) {
      const detail = await api.get(`/orders/takeaway/detail/${orders[0].id}`);
      const items = detail.data.data?.items?.active || detail.data.data?.items || [];
      const withImg = items.filter(i => i.imageUrl);
      if (withImg.length > 0) {
        test('Takeaway item imageUrl is full URL', isFullUrl(withImg[0].imageUrl));
        console.log(`   Sample: ${withImg[0].imageUrl}`);
      } else {
        console.log('   (no takeaway items with images)');
      }
    } else {
      console.log('   (no pending takeaway orders)');
    }
  } catch (e) {
    console.log(`   (skipped: ${e.response?.data?.message || e.message})`);
  }

  // ═══════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log(`${'═'.repeat(60)}`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
})().catch(err => {
  console.error('Fatal:', err.response?.data || err.message);
  process.exit(1);
});
