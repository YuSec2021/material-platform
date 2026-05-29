// Sprint 44 Debug Script - targeted verification
import pkg from '@playwright/test';
const { chromium } = pkg;

const API = 'http://localhost:8000';
const QDRANT = 'http://localhost:6333';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];

  // Create library
  const libResp = await page.request.fetch(`${API}/api/v1/category-libraries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Role': 'super_admin' },
    data: JSON.stringify({ name: `Debug_${Date.now()}`, enabled: true, qdrant_enabled: true }),
  });
  const libBody = await libResp.json();
  const libId = libBody.id || libBody.library?.id;
  console.log(`Library created: id=${libId}`);
  await delay(2000);

  // Create categories - use correct field name
  const catResp = await page.request.fetch(`${API}/api/v1/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Role': 'super_admin' },
    data: JSON.stringify({ name: '复印纸', category_library_id: libId, level: 1, description: '办公用复印纸' }),
  });
  const catStatus = catResp.status();
  const catBody = await catResp.json();
  console.log(`Category create: status=${catStatus} body=${JSON.stringify(catBody)}`);
  const catId = catBody.id || catBody.category?.id;
  await delay(3000);

  // Check Qdrant collection
  if (libId) {
    const colResp = await page.request.fetch(`${QDRANT}/collections/category_library_${libId}`, { method: 'GET' });
    const colBody = await colResp.json();
    console.log(`Collection ${libId}: status=${colResp.status()} body=${JSON.stringify(colBody)}`);

    // Query points
    if (catId) {
      const ptsResp = await page.request.fetch(`${QDRANT}/collections/category_library_${libId}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ with_payload: true, limit: 10 }),
      });
      const ptsBody = await ptsResp.json();
      console.log(`Points: ${JSON.stringify(ptsBody.result?.points || [])}`);
    }
  }

  // Test match endpoint
  const matchResp = await page.request.fetch(`${API}/api/v1/ai/material-category-match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Role': 'super_admin' },
    data: JSON.stringify({ material_name: 'A4复印纸', category_library_ids: [libId] }),
  });
  const matchStatus = matchResp.status();
  const matchBody = await matchResp.json();
  console.log(`Match: status=${matchStatus} body=${JSON.stringify(matchBody)}`);

  await browser.close();
  return errors;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const result = await run();
console.log('Done');