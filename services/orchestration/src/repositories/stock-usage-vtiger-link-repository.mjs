import { sqlValue } from "../db.mjs";
function map(row){return row?{...row}:undefined;}
export class StockUsageVtigerLinkRepository {
  constructor(db){this.db=db;}
  async find(id){return map(await this.db.queryOne(`SELECT * FROM stock_usage_vtiger_links WHERE stock_usage_id=${sqlValue(id)};`));}
  async upsert(l){
    const e = await this.find(l.stock_usage_id);
    if(!e) await this.db.execute(`INSERT INTO stock_usage_vtiger_links (stock_usage_id,remote_id,remote_number,external_key,create_correlation_id,last_correlation_id,sync_status,last_error_code,last_synced_at,created_at,updated_at) VALUES (${sqlValue(l.stock_usage_id)},${sqlValue(l.remote_id)},${sqlValue(l.remote_number)},${sqlValue(l.external_key)},${sqlValue(l.create_correlation_id)},${sqlValue(l.last_correlation_id)},${sqlValue(l.sync_status??"pending")},${sqlValue(l.last_error_code)},${sqlValue(l.last_synced_at)},${sqlValue(l.created_at)},${sqlValue(l.updated_at)});`);
    else await this.db.execute(`UPDATE stock_usage_vtiger_links SET remote_id=${sqlValue(l.remote_id??e.remote_id)},remote_number=${sqlValue(l.remote_number??e.remote_number)},last_correlation_id=${sqlValue(l.last_correlation_id??e.last_correlation_id)},sync_status=${sqlValue(l.sync_status??e.sync_status)},last_error_code=${sqlValue(l.last_error_code)},last_synced_at=${sqlValue(l.last_synced_at)},updated_at=${sqlValue(l.updated_at??new Date().toISOString())} WHERE stock_usage_id=${sqlValue(l.stock_usage_id)};`);
  }
  async markFailure(id,c,s,a){await this.db.execute(`UPDATE stock_usage_vtiger_links SET sync_status=${sqlValue(s)},last_error_code=${sqlValue(c)},updated_at=${sqlValue(a)} WHERE stock_usage_id=${sqlValue(id)};`);}
}
