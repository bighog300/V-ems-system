import { sqlValue } from "../db.mjs";
function map(row) { return row ? { ...row } : undefined; }
export class StockItemVtigerLinkRepository {
  constructor(db) { this.db = db; }
  async findByStockItemId(id) { return map(await this.db.queryOne(`SELECT * FROM stock_item_vtiger_links WHERE stock_item_id=${sqlValue(id)};`)); }
  async upsert(link) {
    const e = await this.findByStockItemId(link.stock_item_id);
    if (!e) await this.db.execute(`INSERT INTO stock_item_vtiger_links (stock_item_id,remote_id,remote_number,external_key,create_correlation_id,last_correlation_id,sync_status,last_error_code,last_synced_at,created_at,updated_at) VALUES (${sqlValue(link.stock_item_id)},${sqlValue(link.remote_id)},${sqlValue(link.remote_number)},${sqlValue(link.external_key)},${sqlValue(link.create_correlation_id)},${sqlValue(link.last_correlation_id)},${sqlValue(link.sync_status??"pending")},${sqlValue(link.last_error_code)},${sqlValue(link.last_synced_at)},${sqlValue(link.created_at)},${sqlValue(link.updated_at)});`);
    else await this.db.execute(`UPDATE stock_item_vtiger_links SET remote_id=${sqlValue(link.remote_id??e.remote_id)},remote_number=${sqlValue(link.remote_number??e.remote_number)},external_key=${sqlValue(link.external_key??e.external_key)},last_correlation_id=${sqlValue(link.last_correlation_id??e.last_correlation_id)},sync_status=${sqlValue(link.sync_status??e.sync_status)},last_error_code=${sqlValue(link.last_error_code)},last_synced_at=${sqlValue(link.last_synced_at)},updated_at=${sqlValue(link.updated_at??new Date().toISOString())} WHERE stock_item_id=${sqlValue(link.stock_item_id)};`);
  }
  async markFailure(id, code, status, at) { await this.db.execute(`UPDATE stock_item_vtiger_links SET sync_status=${sqlValue(status)},last_error_code=${sqlValue(code)},updated_at=${sqlValue(at)} WHERE stock_item_id=${sqlValue(id)};`); }
}
