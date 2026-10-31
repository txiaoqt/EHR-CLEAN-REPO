-- The Dental Clinic's real stock, from its Dental Supplies Monitoring and Inventory
-- Form (F-DTL-8.1d-MIF). Replaces the placeholder items 20261031100000 seeded;
-- those are removed only while no stock movement was logged against them.
-- Quantities are the form's Balance (Pumice has none, so its Qty). Names are as
-- the clinic wrote them. Unit is "boxes" where one pack holds several.
delete from public.inventory i
where i.department = 'Dental Clinic'
  and i.item_name in ('Lidocaine 2% with Epinephrine', 'Dental Needle 27G Short', 'Composite Resin A2',
    'Glass Ionomer Cement', 'Prophylaxis Paste', 'Fluoride Varnish', 'Cotton Rolls', 'Patient Bibs',
    'Examination Gloves (Medium)', 'Mefenamic Acid 500mg')
  and not exists (select 1 from public.inventory_transactions t
    where t.department = 'Dental Clinic' and t.item_name = i.item_name);

insert into public.inventory(item_name, category, stock_quantity, unit, reorder_level, department) values
  ('Fushion Flo Combo Kit', 'Consumables', 1, 'boxes', 1, 'Dental Clinic'),
  ('Fushion Universal', 'Consumables', 1, 'boxes', 1, 'Dental Clinic'),
  ('Cal LC', 'Consumables', 9, 'pcs', 1, 'Dental Clinic'),
  ('50 Celluloid Strips', 'Consumables', 1, 'pcs', 1, 'Dental Clinic'),
  ('Miconazole', 'Medications', 2, 'pcs', 1, 'Dental Clinic'),
  ('Charm Sensy', 'Consumables', 4, 'pcs', 1, 'Dental Clinic'),
  ('Ehros', 'Consumables', 1, 'boxes', 1, 'Dental Clinic'),
  ('Disposable Lighter Protector', 'Consumables', 2, 'pcs', 1, 'Dental Clinic'),
  ('Debacterol', 'Medications', 2, 'pcs', 1, 'Dental Clinic'),
  ('Temrex', 'Consumables', 1, 'pcs', 1, 'Dental Clinic'),
  ('Royal Band', 'Consumables', 1, 'boxes', 1, 'Dental Clinic'),
  ('Charm Base', 'Consumables', 2, 'pcs', 1, 'Dental Clinic'),
  ('Defog', 'Consumables', 8, 'pcs', 1, 'Dental Clinic'),
  ('Prophylactic Brush', 'Consumables', 5, 'pcs', 1, 'Dental Clinic'),
  ('Fushion Flo', 'Consumables', 7, 'pcs', 1, 'Dental Clinic'),
  ('Povidone Iodine', 'First Aid / Disinfectants', 2, 'pcs', 1, 'Dental Clinic'),
  ('Cotton Pellets', 'Consumables', 2, 'pcs', 1, 'Dental Clinic'),
  ('Disposable Micro Applicator', 'Consumables', 5, 'boxes', 1, 'Dental Clinic'),
  ('Hydrogen Peroxide', 'First Aid / Disinfectants', 1, 'pcs', 1, 'Dental Clinic'),
  ('Metricide 28', 'First Aid / Disinfectants', 2, 'pcs', 1, 'Dental Clinic'),
  ('Betadine Gargle 500ml', 'First Aid / Disinfectants', 10, 'pcs', 1, 'Dental Clinic'),
  ('Betadine Gargle 120ml', 'First Aid / Disinfectants', 5, 'pcs', 1, 'Dental Clinic'),
  ('Mefenamic', 'Medications', 3, 'boxes', 1, 'Dental Clinic'),
  ('R.ntied Paracetamol', 'Medications', 1, 'boxes', 1, 'Dental Clinic'),
  ('Philpara', 'Medications', 3, 'boxes', 1, 'Dental Clinic'),
  ('Xylodent', 'Medications', 1, 'boxes', 1, 'Dental Clinic'),
  ('Tranexamic (Haemorex)', 'Medications', 1, 'boxes', 1, 'Dental Clinic'),
  ('Tranexamic (Hernostan)', 'Medications', 2, 'boxes', 1, 'Dental Clinic'),
  ('Amoxicillin', 'Medications', 9, 'boxes', 1, 'Dental Clinic'),
  ('Mefenamic (Myferen)', 'Medications', 5, 'boxes', 1, 'Dental Clinic'),
  ('Disposable Micro Applicators', 'Consumables', 5, 'pcs', 1, 'Dental Clinic'),
  ('Lidocaine', 'Medications', 4, 'boxes', 1, 'Dental Clinic'),
  ('Micro Saliva Ejector', 'Consumables', 13, 'boxes', 1, 'Dental Clinic'),
  ('Disposable Matting', 'PPE', 2, 'pcs', 1, 'Dental Clinic'),
  ('K95 Mask', 'PPE', 40, 'boxes', 1, 'Dental Clinic'),
  ('Pumice', 'Consumables', 3, 'pcs', 1, 'Dental Clinic'),
  ('Ultra Spray Lubricant 200ml', 'Consumables', 1, 'pcs', 1, 'Dental Clinic'),
  ('Fast Lubricant Spray 125ml', 'Consumables', 2, 'boxes', 1, 'Dental Clinic'),
  ('Listerine', 'First Aid / Disinfectants', 24, 'pcs', 1, 'Dental Clinic')
on conflict (department, item_name) do nothing;
