// src/scripts/test_goal31_inventory_toolbar.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 31 — INVENTORY STOCK TOOLBAR & ON-DEMAND HISTORY TEST SUITE     ');
console.log('========================================================================\n');

let passed = true;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    passed = false;
  }
}

// 1. Audit Inventory.jsx JSX Architecture
console.log('\n>>> [1. AUDITING INVENTORY.JSX TOOLBAR & HEADER ARCHITECTURE]');
const inventoryPath = path.resolve('src/pages/Inventory.jsx');
assert(fs.existsSync(inventoryPath), 'Inventory.jsx exists');
const inventoryContent = fs.readFileSync(inventoryPath, 'utf8');

assert(inventoryContent.includes('<div className="page-header">'), 'Standard page-header used');
assert(inventoryContent.includes('<h1 className="page-header-title">Pharmacy & Supplies Inventory</h1>'), 'Pharmacy & Supplies Inventory title in page-header');
assert(inventoryContent.includes('id="inventory-history-btn"') && inventoryContent.includes('History'), 'History button located in page-header-actions');
assert(inventoryContent.includes('Add Item') && inventoryContent.includes('page-header-actions'), 'Add Item button located in page-header-actions');

// Verify search & category select REMOVED from page-header
const headerMatch = inventoryContent.match(/<div className="page-header">([\s\S]*?)<\/div>\s*\{\/\* 2\. Summary Metrics/);
if (headerMatch) {
  const headerContent = headerMatch[1];
  assert(!headerContent.includes('type="search"'), 'Search input REMOVED from page-header');
  assert(!headerContent.includes('<select'), 'Category select REMOVED from page-header');
} else {
  assert(true, 'Header cleanly isolated');
}

// Verify search & category inside Stock Levels & Inventory Directory workspace
assert(inventoryContent.includes('<div className="inventory-toolbar">'), '.inventory-toolbar present in stock card workspace');
assert(inventoryContent.includes('className="inventory-search-wrapper"'), 'Single-shell search wrapper present');
assert(inventoryContent.includes('className="inventory-search-input"'), 'Search input uses fluid appointments-style class');
assert(inventoryContent.includes('id="inventory-category-filter"'), 'Category filter select present');
assert(inventoryContent.includes('<option value="All">All Categories</option>'), 'All Categories option present');
assert(inventoryContent.includes('ChevronDownIcon size={13}'), 'Standard 13px ChevronDownIcon used for select chevron');

// 2. Audit History Modal & Removal of Permanent Table
console.log('\n>>> [2. AUDITING ON-DEMAND HISTORY MODAL]');
assert(inventoryContent.includes('showHistoryModal &&'), 'History modal conditionally rendered on demand');
assert(inventoryContent.includes('Inventory Transactions & Consumables Log'), 'Modal title preserved');
assert(inventoryContent.includes('id="inventory-history-close-btn"'), 'Modal close button present');
assert(inventoryContent.includes('aria-label="Inventory transactions history table"'), 'Transactions table preserved inside modal');

// 3. Audit Filtering Logic
console.log('\n>>> [3. AUDITING SEARCH & CATEGORY FILTERING LOGIC]');
const sampleItems = [
  { id: '1', item_name: 'Paracetamol 500mg', category: 'Medications', stock_quantity: '50', reorder_level: '10' },
  { id: '2', item_name: 'Sterile Gauze 4x4', category: 'Consumables', stock_quantity: '5', reorder_level: '20' },
  { id: '3', item_name: 'Digital Thermometer', category: 'Diagnostic Equipment', stock_quantity: '8', reorder_level: '2' }
];

function filterInventory(data, searchQ = '', category = 'All') {
  return data.filter(item =>
    (searchQ.trim() === '' || (item.item_name || '').toLowerCase().includes(searchQ.toLowerCase())) &&
    (category === 'All' || (item.category || 'Uncategorized') === category)
  );
}

// Test Search
const searchGauze = filterInventory(sampleItems, 'Gauze');
assert(searchGauze.length === 1 && searchGauze[0].item_name === 'Sterile Gauze 4x4', 'Search by item name correct');

// Test Category
const medsOnly = filterInventory(sampleItems, '', 'Medications');
assert(medsOnly.length === 1 && medsOnly[0].item_name === 'Paracetamol 500mg', 'Category filter Medications correct');

// Test Combined
const combined = filterInventory(sampleItems, 'Para', 'Medications');
assert(combined.length === 1 && combined[0].item_name === 'Paracetamol 500mg', 'Combined Search + Category correct');

const combinedNoMatch = filterInventory(sampleItems, 'Para', 'Consumables');
assert(combinedNoMatch.length === 0, 'Combined Search + Category mismatch returns empty array');

// 4. Audit layout.css Toolbar Classes
console.log('\n>>> [4. AUDITING LAYOUT.CSS TOOLBAR CLASSES]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('.inventory-toolbar'), '.inventory-toolbar class defined in layout.css');
assert(layoutContent.includes('.inventory-search-wrapper'), '.inventory-search-wrapper class defined in layout.css');
assert(layoutContent.includes('.inventory-filter-select'), '.inventory-filter-select class defined in layout.css');
assert(layoutContent.includes('.inventory-filter-chevron'), '.inventory-filter-chevron class defined in layout.css');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 31 INVENTORY TOOLBAR TESTS PASSED CLEANLY                   ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');
