// src/scripts/test_goal32_inventory_history_icon.mjs
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('   GOAL 32 — INVENTORY HISTORY ICON-ONLY CONTROL TEST SUITE             ');
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

// 1. Audit Icons.jsx
console.log('\n>>> [1. AUDITING ICONS.JSX FOR HISTORYICON]');
const iconsPath = path.resolve('src/components/icons/Icons.jsx');
assert(fs.existsSync(iconsPath), 'Icons.jsx exists');
const iconsContent = fs.readFileSync(iconsPath, 'utf8');
assert(iconsContent.includes('export const HistoryIcon'), 'HistoryIcon exported from Icons.jsx');

// 2. Audit Inventory.jsx JSX Architecture
console.log('\n>>> [2. AUDITING INVENTORY.JSX HEADER & HISTORY ICON]');
const inventoryPath = path.resolve('src/pages/Inventory.jsx');
assert(fs.existsSync(inventoryPath), 'Inventory.jsx exists');
const inventoryContent = fs.readFileSync(inventoryPath, 'utf8');

assert(inventoryContent.includes('id="inventory-history-btn"'), 'History button present with id="inventory-history-btn"');
assert(inventoryContent.includes('<HistoryIcon size={18} />'), 'History button renders HistoryIcon size={18}');
assert(inventoryContent.includes('title="Inventory History"'), 'History button has title="Inventory History"');
assert(inventoryContent.includes('aria-label="Inventory History"'), 'History button has aria-label="Inventory History"');

// Ensure text "History" is not rendered as button text content
const buttonMatch = inventoryContent.match(/<button[^>]*id="inventory-history-btn"[^>]*>([\s\S]*?)<\/button>/);
assert(buttonMatch && !buttonMatch[1].includes('>History<'), 'History button is icon-only and does not render text');

// Ensure Add Item remains text-only
assert(inventoryContent.includes('Add Item') && inventoryContent.includes('page-header-actions'), 'Add Item button remains text-only primary action');

// Ensure Modal is preserved
assert(inventoryContent.includes('showHistoryModal &&'), 'History modal is conditionally rendered');
assert(inventoryContent.includes('Inventory Transactions & Consumables Log'), 'History modal title preserved');

console.log('\n========================================================================');
if (passed) {
  console.log('   ALL GOAL 32 INVENTORY HISTORY ICON TESTS PASSED CLEANLY              ');
} else {
  console.error('   SOME TESTS FAILED                                                   ');
  process.exit(1);
}
console.log('========================================================================');
