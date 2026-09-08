import { sqlValue } from "../db.mjs";
function map(row) { return row ? { ...row } : undefined; }
export function normalizeDecimal(value) { const text=String(value??"0").trim(); if(!/^\d+(?:\.\d{1,3})?$/.test(text)) throw new Error("Quantity must be a non-negative decimal with up to 3 places"); const [w,f=""] = text.split("."); return `${w}.${f.padEnd(3,"0")}`; }
export function normalizeSignedDecimal(value) { const text=String(value??"0").trim(); return text.startsWith("-") ? `-${normalizeDecimal(text.slice(1))}` : normalizeDecimal(text); }
export function addDecimal(a,b){const scale=1000n; const parse=x=>{const text=String(x);const negative=text.startsWith("-");const n=normalizeDecimal(negative?text.slice(1):text);const [w,f]=n.split(".");const value=BigInt(w)*scale+BigInt(f);return negative?-value:value;}; const n=parse(a)+parse(b);if(n<0n)throw new Error("Quantity cannot be negative");return `${n/scale}.${String(n%scale).padStart(3,"0")}`;}
export class VehicleStockRepository {
  constructor(db){this.db=db;}
  async find(vehicleId,itemId){return map(await this.db.queryOne(`SELECT * FROM vehicle_stock WHERE vehicle_id=${sqlValue(vehicleId)} AND stock_item_id=${sqlValue(itemId)};`));}
  async list(vehicleId){
    const rows = await this.db.queryAll(`SELECT * FROM vehicle_stock WHERE vehicle_id=${sqlValue(vehicleId)} ORDER BY stock_item_id;`);
    return rows.map(map);
  }
  async create(row){await this.db.execute(`INSERT INTO vehicle_stock (vehicle_id,stock_item_id,quantity_on_hand,minimum_quantity,target_quantity,created_at,updated_at,correlation_id) VALUES (${sqlValue(row.vehicle_id)},${sqlValue(row.stock_item_id)},${sqlValue(normalizeDecimal(row.quantity_on_hand))},${sqlValue(normalizeDecimal(row.minimum_quantity))},${sqlValue(normalizeDecimal(row.target_quantity))},${sqlValue(row.created_at)},${sqlValue(row.updated_at)},${sqlValue(row.correlation_id)});`);}
  async update(row){await this.db.execute(`UPDATE vehicle_stock SET quantity_on_hand=${sqlValue(normalizeDecimal(row.quantity_on_hand))},minimum_quantity=${sqlValue(normalizeDecimal(row.minimum_quantity))},target_quantity=${sqlValue(normalizeDecimal(row.target_quantity))},updated_at=${sqlValue(row.updated_at)},correlation_id=${sqlValue(row.correlation_id)} WHERE vehicle_id=${sqlValue(row.vehicle_id)} AND stock_item_id=${sqlValue(row.stock_item_id)};`);}
}
