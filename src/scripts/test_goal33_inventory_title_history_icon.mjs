// src/scripts/test_goal33_inventory_title_history_icon.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 33 — INVENTORY TITLE-INTEGRATED HISTORY ICON TEST SUITE         ');
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
console.log('\n>>> [1. AUDITING INVENTORY.JSX TITLE BLOCK & HISTORY ICON]');
const inventoryPath = path.resolve('src/pages/Inventory.jsx');
assert(fs.existsSync(inventoryPath), 'Inventory.jsx exists');
const inventoryContent = fs.readFileSync(inventoryPath, 'utf8');

// Verify History icon is located inside page-header-title-block beside Pharmacy & Supplies Inventory
const titleBlockMatch = inventoryContent.match(/<div className="page-header-title-block">([\s\S]*?)<\/div>\s*<div className="page-header-actions">/);
assert(titleBlockMatch, 'page-header-title-block exists before page-header-actions');
if (titleBlockMatch) {
  const titleBlock = titleBlockMatch[1];
  assert(titleBlock.includes('Pharmacy & Supplies Inventory'), 'Pharmacy & Supplies Inventory title is in title-block');
  assert(titleBlock.includes('id="inventory-history-btn"'), 'History icon button is located inside title-block');
  assert(titleBlock.includes('className="inventory-history-icon-btn"'), 'History icon uses .inventory-history-icon-btn class');
  assert(!titleBlock.includes('className="btn'), 'History icon does NOT use .btn button class');
  assert(titleBlock.includes('title="Inventory History"'), 'History icon has title="Inventory History"');
  assert(titleBlock.includes('aria-label="Inventory History"'), 'History icon has aria-label="Inventory History"');
  assert(titleBlock.includes('<HistoryIcon'), 'History icon renders HistoryIcon component');
}

// Verify page-header-actions only contains Add Item
const actionsMatch = inventoryContent.match(/<div className="page-header-actions">([\s\S]*?)<\/div>/);
assert(actionsMatch, 'page-header-actions exists');
if (actionsMatch) {
  const actions = actionsMatch[1];
  assert(!actions.includes('id="inventory-history-btn"'), 'History button REMOVED from page-header-actions');
  assert(actions.includes('Add Item'), 'Add Item is present in page-header-actions');
}

// 2. Audit layout.css for .inventory-history-icon-btn
console.log('\n>>> [2. AUDITING LAYOUT.CSS FOR .INVENTORY-HISTORY-ICON-BTN]');
const layoutPath = path.resolve('src/styles/layout.css');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

assert(layoutContent.includes('.inventory-history-icon-btn'), '.inventory-history-icon-btn defined in layout.css');
assert(layoutContent.includes('background: transparent'), '.inventory-history-icon-btn has transparent background');
assert(layoutContent.includes('border: none'), '.inventory-history-icon-btn has border: none (no button outline)');

// 3. Audit History Modal Integration
console.log('\n>>> [3. AUDITING ON-DEMAND HISTORY MODAL]');
assert(inventoryContent.includes('showHistoryModal &&'), 'History modal is conditionally rendered on demand');
assert(inventoryContent.includes('Inventory Transactions & Consumables Log'), 'History modal title preserved');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 33 INVENTORY TITLE HISTORY ICON TESTS PASSED CLEANLY        ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');
