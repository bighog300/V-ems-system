import { sqlValue } from "../db.mjs";

export class DevicePairingRepository {
  constructor(db) {
    this.db = db;
  }

  async create(record) {
    const keys = Object.keys(record);
    await this.db.execute(`INSERT INTO device_pairings (${keys.join(",")}) VALUES (${keys.map((key) => sqlValue(record[key])).join(",")});`);
  }

  async find(pairingId) {
    return this.db.queryOne(`SELECT * FROM device_pairings WHERE pairing_id=${sqlValue(pairingId)};`);
  }

  async save(record) {
    const keys = Object.keys(record).filter((key) => key !== "pairing_id");
    await this.db.execute(`UPDATE device_pairings SET ${keys.map((key) => `${key}=${sqlValue(record[key])}`).join(",")} WHERE pairing_id=${sqlValue(record.pairing_id)};`);
  }

  async listByVehicle(vehicleId) {
    return this.db.queryAll(`SELECT * FROM device_pairings WHERE vehicle_id=${sqlValue(vehicleId)} ORDER BY paired_at DESC;`);
  }

  async listBySerial(serialNumber) {
    return this.db.queryAll(`SELECT * FROM device_pairings WHERE serial_number=${sqlValue(serialNumber)} ORDER BY paired_at DESC;`);
  }
}
