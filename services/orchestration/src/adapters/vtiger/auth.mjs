import crypto from "node:crypto";
import { VtigerError, sanitizeMessage } from "./errors.mjs";

export class VtigerAuth {
  constructor({ baseUrl, username, accessKey, timeoutMs = 5000, fetchImpl = fetch } = {}) {
    this.baseUrl = baseUrl?.replace(/\/$/, ""); this.username = username; this.accessKey = accessKey;
    this.timeoutMs = Number(timeoutMs); this.fetch = fetchImpl; this.sessionName = null;
  }

  async request(operation, params = {}, method = "GET") {
    const body = new URLSearchParams({ operation, ...params });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}/webservice.php${method === "GET" ? `?${body}` : ""}`, {
        method, headers: { accept: "application/json", ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
        body: method === "POST" ? body : undefined, signal: controller.signal
      });
      const text = await response.text();
      let data; try { data = JSON.parse(text); } catch { throw new VtigerError("VTIGER_PROTOCOL_ERROR", "Vtiger returned a non-JSON response", { operation, httpStatus: response.status, outcomeUnknown: operation === "create" }); }
      if (!response.ok) throw new VtigerError(response.status >= 500 ? "VTIGER_SERVER_ERROR" : "VTIGER_UNAVAILABLE", `Vtiger HTTP ${response.status}`, { operation, httpStatus: response.status, outcomeUnknown: operation === "create" });
      if (!data.success) {
        const code = data.error?.code;
        if (code === "INVALID_SESSIONID") throw new VtigerError("VTIGER_SESSION_EXPIRED", "Vtiger session expired", { operation });
        if (["ACCESS_DENIED", "ACCESSDENIED"].includes(code)) throw new VtigerError("VTIGER_PERMISSION_DENIED", "Vtiger permission denied", { operation });
        if (["MANDATORY_FIELDS_MISSING", "INVALIDID", "INVALIDVALUE"].includes(code)) throw new VtigerError("VTIGER_VALIDATION_FAILED", sanitizeMessage(data.error?.message), { operation });
        throw new VtigerError("VTIGER_PROTOCOL_ERROR", sanitizeMessage(data.error?.message), { operation });
      }
      return data.result;
    } catch (error) {
      if (error.name === "AbortError") throw new VtigerError("VTIGER_OUTCOME_UNKNOWN", "Vtiger request timed out", { operation, outcomeUnknown: operation === "create", cause: error });
      throw error;
    } finally { clearTimeout(timer); }
  }

  async authenticate() {
    if (!this.baseUrl || !this.username || !this.accessKey) throw new VtigerError("VTIGER_AUTH_FAILED", "Vtiger authentication configuration is incomplete", { operation: "login" });
    const challenge = await this.request("getchallenge", { username: this.username });
    const digest = crypto.createHash("md5").update(`${challenge.token}${this.accessKey}`).digest("hex");
    const result = await this.request("login", { username: this.username, accessKey: digest }, "POST");
    if (!result?.sessionName) throw new VtigerError("VTIGER_PROTOCOL_ERROR", "Vtiger login response did not include a session", { operation: "login" });
    this.sessionName = result.sessionName; return result;
  }

  async call(operation, params = {}, method = "GET", refresh = true) {
    if (!this.sessionName) await this.authenticate();
    try { return await this.request(operation, { ...params, sessionName: this.sessionName }, method); }
    catch (error) {
      if (refresh && error.code === "VTIGER_SESSION_EXPIRED") { this.sessionName = null; await this.authenticate(); return this.call(operation, params, method, false); }
      throw error;
    }
  }
}
