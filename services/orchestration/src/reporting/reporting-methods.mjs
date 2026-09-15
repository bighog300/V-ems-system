import { getIncidentVolumeReport, getStockUsageReport, getQaFlagReport } from "./operational-reports.mjs";
import { getAuditLogReport } from "./audit-report.mjs";

export const reportingMethods = {
  async getIncidentVolumeReport(options) { return getIncidentVolumeReport(this, options); },
  async getStockUsageReport(options) { return getStockUsageReport(this, options); },
  async getQaFlagReport(options) { return getQaFlagReport(this, options); },
  async getAuditLogReport(options) { return getAuditLogReport(this, options); }
};
