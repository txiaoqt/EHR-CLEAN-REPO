import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js';
import { logAudit } from '../utils.js';
import { useAuth } from '../AuthContext.jsx';
import { canDeleteRecord } from '../accessControl.js';
import { SearchIcon, AlertIcon, CloseIcon, ChevronDownIcon, HistoryIcon } from '../components/icons/Icons.jsx';

const Inventory = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({
    item_name: '',
    category: 'Medications',
    stock_quantity: '',
    unit: 'pcs',
    reorder_level: '10'
  });
  const [modalMessage, setModalMessage] = useState('');
  const [modalMessageType, setModalMessageType] = useState(''); // 'success' or 'error'
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustData, setAdjustData] = useState({
    type: 'add', // 'add' or 'remove'
    quantity: '',
    reason: ''
  });
  const [adjustModalMessage, setAdjustModalMessage] = useState('');
  const [adjustModalMessageType, setAdjustModalMessageType] = useState(''); // 'success' or 'error'

  // New: delete modal / verification
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleteMessageType, setDeleteMessageType] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ---------- Validation constraints & helpers (ADDED) ----------
  const NAME_MAX = 100;
  const STOCK_MAX = 100000;
  const REORDER_MAX = 10000;
  const ADJUST_QTY_MAX = 100000;
  // Allow letters, numbers, spaces and a few safe punctuation for item names and reasons
  const nameAllowedRegex = /[^A-Za-z0-9 \.\-,()\/]/g; // we will strip everything not allowed
  const reasonAllowedRegex = /[^A-Za-z0-9 \.\-,()]/g;

  const sanitizeName = (v) => {
    if (v == null) return '';
    let s = v.toString();
    // remove disallowed characters
    s = s.replace(nameAllowedRegex, '');
    // collapse multiple spaces
    s = s.replace(/\s+/g, ' ');
    // trim and enforce max length
    s = s.trim().slice(0, NAME_MAX);
    return s;
  };

  const sanitizeIntegerInput = (value, maxValue = Infinity) => {
    if (value == null) return '';
    let v = value.toString();
    // remove non-digits
    v = v.replace(/[^\d]/g, '');
    v = v.replace(/^0+(?=\d)/, ''); // strip leading zeros
    if (v === '') return '';
    const num = Number(v);
    if (!Number.isNaN(num) && num > maxValue) return String(maxValue);
    return v;
  };

  const sanitizeReason = (v) => {
    if (v == null) return '';
    let s = v.toString();
    s = s.replace(reasonAllowedRegex, '');
    s = s.replace(/\s+/g, ' ');
    s = s.trim().slice(0, 200); // cap reason length
    return s;
  };
  // ----------------------------------------------------------------

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: invData, error: invError } = await supabase.from('inventory').select('*');
        if (invError) throw invError;
        setItems(invData || []);

        const { data: transData, error: transError } = await supabase.from('inventory_transactions').select('*').order('created_at', { ascending: false });
        if (transError) throw transError;
        setTransactions(transData || []);
      } catch (err) {
        console.error('Error fetching inventory data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const refreshData = async () => {
    try {
      const { data: invData } = await supabase.from('inventory').select('*');
      setItems(invData || []);
      const { data: transData } = await supabase.from('inventory_transactions').select('*').order('created_at', { ascending: false });
      setTransactions(transData || []);
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  };

  const categories = [
    'Medications',
    'Diagnostic Equipment',
    'PPE',
    'Consumables',
    'First Aid / Disinfectants'
  ];

  const filteredItems = items.filter(item =>
    (search.trim() === '' || (item.item_name || '').toLowerCase().includes(search.toLowerCase())) &&
    (selectedCategory === 'All' || (item.category || 'Uncategorized') === selectedCategory)
  );

  const reorderItems = items.filter(item => Number(item.stock_quantity) <= Number(item.reorder_level));
  const actorName = (user?.name || user?.email || 'Unknown Staff').trim();

  const addStock = () => setShowAddModal(true);

  // handle new item changes with sanitization
  const handleNewItemChange = (e) => {
    const { name, value } = e.target;
    if (name === 'item_name') {
      setNewItem(prev => ({ ...prev, item_name: sanitizeName(value) }));
      return;
    }
    if (name === 'stock_quantity') {
      const sanitized = sanitizeIntegerInput(value, STOCK_MAX);
      setNewItem(prev => ({ ...prev, stock_quantity: sanitized }));
      return;
    }
    if (name === 'reorder_level') {
      const sanitized = sanitizeIntegerInput(value, REORDER_MAX);
      setNewItem(prev => ({ ...prev, reorder_level: sanitized }));
      return;
    }
    // unit & category are safe selects
    setNewItem(prev => ({ ...prev, [name]: value }));
  };

  const submitNewItem = async () => {
    setModalMessage('');
    setModalMessageType('');

    const sanitizedName = sanitizeName(newItem.item_name || '');
    if (!sanitizedName) {
      setModalMessage('Item name is required and must not contain special characters.');
      setModalMessageType('error');
      return;
    }
    if (sanitizedName.length > NAME_MAX) {
      setModalMessage(`Item name is too long (max ${NAME_MAX} characters).`);
      setModalMessageType('error');
      return;
    }

    const stockQty = Number(newItem.stock_quantity || 0);
    const reorderLvl = Number(newItem.reorder_level || 0);

    if (isNaN(stockQty) || stockQty < 0) {
      setModalMessage('Stock quantity must be a positive integer.');
      setModalMessageType('error');
      return;
    }
    if (stockQty > STOCK_MAX) {
      setModalMessage(`Stock quantity exceeds maximum allowed (${STOCK_MAX}).`);
      setModalMessageType('error');
      return;
    }

    if (isNaN(reorderLvl) || reorderLvl <= 0) {
      setModalMessage('Reorder level must be a positive integer greater than 0.');
      setModalMessageType('error');
      return;
    }
    if (reorderLvl > REORDER_MAX) {
      setModalMessage(`Reorder level exceeds maximum allowed (${REORDER_MAX}).`);
      setModalMessageType('error');
      return;
    }

    // Check for duplicate item name (use sanitized names for comparison)
    const exists = items.find(item => (item.item_name || '').toLowerCase() === sanitizedName.toLowerCase());
    if (exists) {
      setModalMessage('An item with this name already exists.');
      setModalMessageType('error');
      return;
    }

    try {
      const { error } = await supabase.from('inventory').insert([{
        item_name: sanitizedName,
        category: newItem.category,
        stock_quantity: stockQty,
        unit: newItem.unit,
        reorder_level: reorderLvl
      }]);
      if (error) throw error;

      // Add transaction
      await supabase.from('inventory_transactions').insert([{
        item_name: sanitizedName,
        transaction_type: 'in',
        quantity: stockQty,
        reason: 'New item added',
        performed_by: actorName
      }]);

      // Log audit entry
      await logAudit('Inventory Item Addition', `Added new inventory item: ${sanitizedName} with ${stockQty} ${newItem.unit}`);

      // Refresh data
      await refreshData();

      setModalMessage('Item added successfully!');
      setModalMessageType('success');

      // Close modal after success
      setTimeout(() => {
        setShowAddModal(false);
        setNewItem({
          item_name: '',
          category: 'Medications',
          stock_quantity: '',
          unit: 'pcs',
          reorder_level: '10'
        });
        setModalMessage('');
        setModalMessageType('');
      }, 1200);
    } catch (err) {
      console.error('Error adding item:', err);
      setModalMessage('Error adding item: ' + (err.message || 'Unknown error'));
      setModalMessageType('error');
    }
  };

  const adjust = (item) => {
    setAdjustItem(item);
    setShowAdjustModal(true);
    setAdjustData({ type: 'add', quantity: '', reason: '' });
    setAdjustModalMessage('');
    setAdjustModalMessageType('');
  };

  const handleAdjustChange = (e) => {
    const { name, value } = e.target;
    if (name === 'quantity') {
      const sanitized = sanitizeIntegerInput(value, ADJUST_QTY_MAX);
      setAdjustData(prev => ({ ...prev, quantity: sanitized }));
      return;
    }
    if (name === 'reason') {
      const sanitized = sanitizeReason(value);
      setAdjustData(prev => ({ ...prev, reason: sanitized }));
      return;
    }
    setAdjustData(prev => ({ ...prev, [name]: value }));
  };

  const submitAdjust = async () => {
    setAdjustModalMessage('');
    setAdjustModalMessageType('');

    if (!adjustData.reason.trim()) {
      setAdjustModalMessage('Reason is required and must not contain special characters.');
      setAdjustModalMessageType('error');
      return;
    }

    const qty = Number(adjustData.quantity);
    if (isNaN(qty) || qty <= 0) {
      setAdjustModalMessage('Quantity must be a positive integer.');
      setAdjustModalMessageType('error');
      return;
    }
    if (qty > ADJUST_QTY_MAX) {
      setAdjustModalMessage(`Quantity exceeds maximum allowed (${ADJUST_QTY_MAX}).`);
      setAdjustModalMessageType('error');
      return;
    }

    const currentQty = Number(adjustItem.stock_quantity) || 0;
    const newQty = adjustData.type === 'add' ? currentQty + qty : currentQty - qty;
    if (newQty < 0) {
      setAdjustModalMessage('Cannot remove more than available stock.');
      setAdjustModalMessageType('error');
      return;
    }
    if (newQty > STOCK_MAX) {
      setAdjustModalMessage(`Resulting stock would exceed maximum allowed (${STOCK_MAX}).`);
      setAdjustModalMessageType('error');
      return;
    }

    try {
      const { error } = await supabase
        .from('inventory')
        .update({ stock_quantity: newQty })
        .eq('id', adjustItem.id);

      if (error) throw error;

      // Add transaction
      await supabase.from('inventory_transactions').insert([{
        item_name: adjustItem.item_name,
        transaction_type: adjustData.type === 'add' ? 'in' : 'out',
        quantity: qty,
        reason: adjustData.reason.trim(),
        performed_by: actorName
      }]);

      // Log audit entry
      const actionType = adjustData.type === 'add' ? 'added to' : 'removed from';
      await logAudit('Inventory Stock Adjustment', `${qty} units ${actionType} inventory: ${adjustItem.item_name}. Reason: ${adjustData.reason.trim()}`);

      // Refresh data
      await refreshData();

      setAdjustModalMessage('Stock adjusted successfully!');
      setAdjustModalMessageType('success');

      // Close modal after success
      setTimeout(() => {
        setShowAdjustModal(false);
        setAdjustItem(null);
        setAdjustData({ type: 'add', quantity: '', reason: '' });
        setAdjustModalMessage('');
        setAdjustModalMessageType('');
      }, 1200);
    } catch (err) {
      console.error('Error adjusting stock:', err);
      setAdjustModalMessage('Error adjusting stock: ' + (err.message || 'Unknown error'));
      setAdjustModalMessageType('error');
    }
  };

  // NEW: Delete flow
  const openDeleteModal = (item) => {
    setDeleteItem(item);
    setDeleteConfirmName('');
    setDeleteMessage('');
    setDeleteMessageType('');
    setShowDeleteModal(true);
  };

  const submitDelete = async () => {
    setDeleteMessage('');
    setDeleteMessageType('');

    if (!canDeleteRecord(user)) {
      setDeleteMessage('Only physicians can delete inventory items.');
      setDeleteMessageType('error');
      return;
    }

    if (!deleteItem) return;

    // verification: require exact item name typed
    if ((deleteConfirmName || '').trim() !== (deleteItem.item_name || '')) {
      setDeleteMessage('Please type the exact item name to confirm deletion.');
      setDeleteMessageType('error');
      return;
    }

    if (!deletePassword) {
      setDeleteMessage('Password is required.');
      setDeleteMessageType('error');
      return;
    }

    setDeleting(true);
    try {
      // Verify password with Supabase Auth
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: deletePassword,
      });

      if (verifyError) {
        setDeleteMessage('Incorrect password.');
        setDeleteMessageType('error');
        setDeleting(false);
        return;
      }

      // delete item
      const { error: delErr } = await supabase.from('inventory').delete().eq('id', deleteItem.id);
      if (delErr) throw delErr;

      // add a transaction record for the deletion (out with reason 'deleted')
      await supabase.from('inventory_transactions').insert([{
        item_name: deleteItem.item_name,
        transaction_type: 'out',
        quantity: deleteItem.stock_quantity || 0,
        reason: 'Item deleted from inventory',
        performed_by: actorName
      }]);

      // audit log
      await logAudit('Inventory Item Deletion', `Deleted inventory item: ${deleteItem.item_name} (id: ${deleteItem.id})`);

      // refresh
      await refreshData();

      setDeleteMessage('Item deleted successfully.');
      setDeleteMessageType('success');

      setTimeout(() => {
        setShowDeleteModal(false);
        setDeleteItem(null);
        setDeleteConfirmName('');
        setDeletePassword('');
        setDeleteMessage('');
        setDeleteMessageType('');
      }, 900);
    } catch (err) {
      console.error('Error deleting item:', err);
      setDeleteMessage('Error deleting item: ' + (err.message || 'Unknown error'));
      setDeleteMessageType('error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <main className="main"><div className="card">Loading inventory...</div></main>;

  return (
    <main className="main">
      <div className="page">
        {/* 1. Page Header: Title with integrated History utility icon + Add Item primary action */}
        <div className="page-header">
          <div className="page-header-title-block">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 className="page-header-title" style={{ margin: 0 }}>Pharmacy & Supplies Inventory</h1>
              <button
                type="button"
                id="inventory-history-btn"
                className="inventory-history-icon-btn"
                onClick={() => setShowHistoryModal(true)}
                title="Inventory History"
                aria-label="Inventory History"
              >
                <HistoryIcon size={19} />
              </button>
            </div>
            <div className="page-header-subtitle">
              Track medicine inventory, medical supplies, reorder levels, and dispensing logs.
            </div>
          </div>

          <div className="page-header-actions">
            <button
              type="button"
              className="btn"
              onClick={addStock}
            >
              Add Item
            </button>
          </div>
        </div>

        {/* 2. Summary Metrics (4 Mini Cards) */}
        <div className="inventory-kpi-grid">
          <div className="kpi-card" style={{ minHeight: 90, padding: '14px 18px' }}>
            <div className="kpi-title" style={{ fontSize: 12 }}>Total Cataloged Items</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>{items.length}</div>
          </div>
          <div className="kpi-card" style={{ minHeight: 90, padding: '14px 18px' }}>
            <div className="kpi-title" style={{ fontSize: 12 }}>Low Stock Alerts</div>
            <div className="kpi-value" style={{ fontSize: 22, color: reorderItems.length > 0 ? 'var(--danger)' : 'var(--color-emerald-text)' }}>
              {reorderItems.length}
            </div>
          </div>
          <div className="kpi-card" style={{ minHeight: 90, padding: '14px 18px' }}>
            <div className="kpi-title" style={{ fontSize: 12 }}>Adequate Stock</div>
            <div className="kpi-value" style={{ fontSize: 22, color: 'var(--color-emerald-text)' }}>
              {items.length - reorderItems.length}
            </div>
          </div>
          <div className="kpi-card" style={{ minHeight: 90, padding: '14px 18px' }}>
            <div className="kpi-title" style={{ fontSize: 12 }}>Recent Log Entries</div>
            <div className="kpi-value" style={{ fontSize: 22, color: 'var(--color-purple-text)' }}>
              {transactions.length}
            </div>
          </div>
        </div>

        {/* Reorder Alerts */}
        {reorderItems.length > 0 && (
          <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--danger)', background: '#fff5f5' }}>
            <div className="card-header" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center' }}>
                  <AlertIcon size={18} />
                </span>
                <h3 className="card-title" style={{ color: 'var(--danger)' }}>Reorder Attention Required</h3>
              </div>
              <span className="badge badge-danger">{reorderItems.length} items below minimum</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              {reorderItems.map(item => (
                <div key={item.id} style={{ background: '#ffffff', padding: '8px 14px', borderRadius: 8, border: '1px solid #fecaca', fontSize: 13 }}>
                  <strong>{item.item_name}</strong>: Current stock <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{item.stock_quantity} {item.unit}</span> (Reorder threshold: {item.reorder_level})
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Stock Levels & Inventory Directory Workspace */}
        <div className="card" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                Stock Levels & Inventory Directory
              </h2>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Clinic medicine catalog and consumable supply status
              </div>
            </div>

            <span className="badge badge-neutral" style={{ fontSize: 12, padding: '4px 10px' }}>
              Showing: <strong>{filteredItems.length}</strong> items
            </span>
          </div>

          {/* Stock Toolbar: Fluid Search + All Categories Dropdown */}
          <div className="inventory-toolbar">
            {/* 1. Full-Width Search Input (Single visible input shell) */}
            <div className="inventory-search-wrapper">
              <span style={{ color: 'var(--text-light)', display: 'inline-flex', alignItems: 'center' }}>
                <SearchIcon size={16} />
              </span>
              <input
                id="inventory-search"
                type="search"
                className="inventory-search-input"
                placeholder="Search item name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search item name"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)' }}
                  aria-label="Clear search"
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </div>

            {/* 2. Category Filter Dropdown */}
            <div className="inventory-filter-group">
              <div className="inventory-select-wrapper">
                <select
                  id="inventory-category-filter"
                  className="inventory-filter-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  aria-label="Filter by category"
                >
                  <option value="All">All Categories</option>
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <span className="inventory-filter-chevron">
                  <ChevronDownIcon size={13} />
                </span>
              </div>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table" aria-label="Inventory table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Stock Quantity</th>
                  <th>Unit</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                      No inventory items found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => {
                    const isLow = Number(item.stock_quantity) < Number(item.reorder_level);
                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 700, color: 'var(--text)' }}>{item.item_name}</td>
                        <td>
                          <span className="badge badge-info">{item.category || 'Supplies'}</span>
                        </td>
                        <td style={{ fontWeight: 700, fontSize: 15 }}>{item.stock_quantity}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{item.unit}</td>
                        <td style={{ color: 'var(--text-light)' }}>{item.reorder_level}</td>
                        <td>
                          <span className={isLow ? 'badge badge-danger' : 'badge badge-success'}>
                            {isLow ? 'Low Stock' : 'Adequate'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 8 }}>
                            <button className="btn secondary small" onClick={() => adjust(item)}>
                              Adjust
                            </button>

                            {canDeleteRecord(user) && (
                              <button
                                className="btn danger small"
                                onClick={() => openDeleteModal(item)}
                                title="Delete this item"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. History Modal (On-Demand Transactions Log) */}
        {showHistoryModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1200,
              padding: 16
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowHistoryModal(false); }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: 16,
                boxShadow: 'var(--shadow-lg)',
                maxWidth: '1100px',
                width: '100%',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
                    Inventory Transactions & Consumables Log
                  </h3>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    Total Logs: <strong>{transactions.length}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  id="inventory-history-close-btn"
                  className="modal-close-btn"
                  onClick={() => setShowHistoryModal(false)}
                  aria-label="Close modal"
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              {/* Modal Body: Scrollable Table */}
              <div style={{ overflowY: 'auto', padding: '16px 24px', flex: 1 }}>
                <div className="table-responsive">
                  <table className="table" aria-label="Inventory transactions history table">
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Type</th>
                        <th>Quantity</th>
                        <th>Reason / Notes</th>
                        <th>Performed By</th>
                        <th>Date & Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                            No transactions logged yet.
                          </td>
                        </tr>
                      ) : (
                        transactions.map(trans => {
                          const isAdd = (trans.transaction_type || '').toLowerCase().includes('add');
                          return (
                            <tr key={trans.id}>
                              <td style={{ fontWeight: 700, color: 'var(--text)' }}>{trans.item_name}</td>
                              <td>
                                <span className={isAdd ? 'badge badge-success' : 'badge badge-purple'}>
                                  {isAdd ? 'Stock Added' : 'Stock Deducted'}
                                </span>
                              </td>
                              <td style={{ fontWeight: 700 }}>{trans.quantity}</td>
                              <td style={{ color: 'var(--text-muted)' }}>{trans.reason || 'Routine Adjustment'}</td>
                              <td>{trans.performed_by || 'Staff'}</td>
                              <td style={{ color: 'var(--text-light)', fontSize: 12.5 }}>
                                {new Date(trans.created_at).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', background: 'var(--grey-50, #f8fafc)' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowHistoryModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Item Modal */}
        {showAddModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200
          }}>
            <div style={{
              background: '#ffffff',
              padding: '24px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-lg)',
              maxWidth: '440px',
              width: '100%'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Add Inventory Item</h3>
                <button type="button" className="modal-close-btn" onClick={() => setShowAddModal(false)} aria-label="Close modal">
                  <CloseIcon size={18} />
                </button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); submitNewItem(); }}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Item Name</label>
                  <input
                    name="item_name"
                    type="text"
                    className="input"
                    value={newItem.item_name}
                    onChange={handleNewItemChange}
                    placeholder="e.g., Paracetamol 500mg"
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Category</label>
                  <select
                    name="category"
                    className="input"
                    value={newItem.category}
                    onChange={handleNewItemChange}
                    style={{ width: '100%' }}
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Initial Stock</label>
                    <input
                      name="stock_quantity"
                      type="number"
                      className="input"
                      value={newItem.stock_quantity}
                      onChange={handleNewItemChange}
                      min="0"
                      max={STOCK_MAX}
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Unit</label>
                    <select
                      name="unit"
                      className="input"
                      value={newItem.unit}
                      onChange={handleNewItemChange}
                      style={{ width: '100%' }}
                    >
                      <option value="pcs">pcs</option>
                      <option value="boxes">boxes</option>
                      <option value="ml">ml</option>
                      <option value="mg">mg</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Reorder Threshold Level</label>
                  <input
                    name="reorder_level"
                    type="number"
                    className="input"
                    value={newItem.reorder_level}
                    onChange={handleNewItemChange}
                    min="1"
                    max={REORDER_MAX}
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                {modalMessage && (
                  <div style={{
                    padding: '10px 14px',
                    marginBottom: '14px',
                    borderRadius: '10px',
                    color: modalMessageType === 'error' ? 'var(--danger)' : '#059669',
                    background: modalMessageType === 'error' ? '#fef2f2' : 'rgba(5, 150, 105, 0.1)',
                    fontSize: '13px',
                    fontWeight: 600
                  }}>
                    {modalMessage}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn">Add Item</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Adjust Stock Modal */}
        {showAdjustModal && adjustItem && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200
          }}>
            <div style={{
              background: '#ffffff',
              padding: '24px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-lg)',
              maxWidth: '440px',
              width: '100%'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Adjust Stock: {adjustItem.item_name}</h3>
                <button type="button" className="modal-close-btn" onClick={() => setShowAdjustModal(false)} aria-label="Close modal">
                  <CloseIcon size={18} />
                </button>
              </div>

              <div style={{ padding: '10px 14px', background: 'var(--grey-100)', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
                Current stock: <strong>{adjustItem.stock_quantity} {adjustItem.unit}</strong>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); submitAdjust(); }}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Action</label>
                  <select
                    name="type"
                    className="input"
                    value={adjustData.type}
                    onChange={handleAdjustChange}
                    style={{ width: '100%' }}
                  >
                    <option value="add">Add Stock (Restock)</option>
                    <option value="remove">Remove Stock (Dispense / Used)</option>
                  </select>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Quantity</label>
                  <input
                    name="quantity"
                    type="number"
                    className="input"
                    value={adjustData.quantity}
                    onChange={handleAdjustChange}
                    min="1"
                    max={ADJUST_QTY_MAX}
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Reason / Remarks</label>
                  <input
                    name="reason"
                    type="text"
                    className="input"
                    value={adjustData.reason}
                    onChange={handleAdjustChange}
                    placeholder="e.g., Routine Restock, Dispensed to patient"
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                {adjustModalMessage && (
                  <div style={{
                    padding: '10px 14px',
                    marginBottom: '14px',
                    borderRadius: '10px',
                    color: adjustModalMessageType === 'error' ? 'var(--danger)' : '#059669',
                    background: adjustModalMessageType === 'error' ? '#fef2f2' : 'rgba(5, 150, 105, 0.1)',
                    fontSize: '13px',
                    fontWeight: 600
                  }}>
                    {adjustModalMessage}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn secondary" onClick={() => setShowAdjustModal(false)}>Cancel</button>
                  <button type="submit" className="btn">Confirm Adjustment</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete confirmation modal */}
        {showDeleteModal && deleteItem && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1250
          }}>
            <div style={{
              background: '#ffffff',
              padding: '24px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-lg)',
              maxWidth: '480px',
              width: '100%'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>Delete Item: {deleteItem.item_name}</h3>
                <button type="button" className="modal-close-btn" onClick={() => setShowDeleteModal(false)} aria-label="Close modal">
                  <CloseIcon size={18} />
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
                This will permanently remove the item from inventory catalog. To confirm, type the item name <strong>{deleteItem.item_name}</strong> below.
              </p>

              <div style={{ marginBottom: 14 }}>
                <input
                  className="input"
                  type="text"
                  placeholder="Type exact item name to confirm"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(sanitizeName(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Enter your password to verify:</label>
                <input
                  type="password"
                  className="input"
                  style={{ width: '100%' }}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
              </div>

              {deleteMessage && (
                <div style={{
                  padding: '10px 14px',
                  marginBottom: '14px',
                  borderRadius: '10px',
                  color: deleteMessageType === 'error' ? 'var(--danger)' : '#059669',
                  background: deleteMessageType === 'error' ? '#fef2f2' : 'rgba(5, 150, 105, 0.1)',
                  fontSize: '13px',
                  fontWeight: 600
                }}>
                  {deleteMessage}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancel</button>
                <button className="btn danger" onClick={submitDelete} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete Item'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default Inventory;
