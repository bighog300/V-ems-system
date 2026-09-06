import { sqlValue } from "../db.mjs";
function map(row) { return row ? { ...row } : undefined; }
export class StockItemRepository {
  constructor(db) { this.db = db; }
  create(item) { this.db.execute(`INSERT INTO stock_items (stock_item_id,name,category,unit_of_measure,item_type,active_status,description,created_at,updated_at,correlation_id) VALUES (${sqlValue(item.stock_item_id)},${sqlValue(item.name)},${sqlValue(item.category)},${sqlValue(item.unit_of_measure)},${sqlValue(item.item_type)},${sqlValue(item.active_status)},${sqlValue(item.description)},${sqlValue(item.created_at)},${sqlValue(item.updated_at)},${sqlValue(item.correlation_id)});`); }
  findById(id) { return map(this.db.queryOne(`SELECT * FROM stock_items WHERE stock_item_id=${sqlValue(id)};`)); }
  list() { return this.db.queryAll("SELECT * FROM stock_items ORDER BY stock_item_id;").map(map); }
  update(item) { this.db.execute(`UPDATE stock_items SET name=${sqlValue(item.name)},category=${sqlValue(item.category)},unit_of_measure=${sqlValue(item.unit_of_measure)},item_type=${sqlValue(item.item_type)},active_status=${sqlValue(item.active_status)},description=${sqlValue(item.description)},updated_at=${sqlValue(item.updated_at)},correlation_id=${sqlValue(item.correlation_id)} WHERE stock_item_id=${sqlValue(item.stock_item_id)};`); }
}
