import { getIncidentVolumeReport, getStockUsageReport, getQaFlagReport } from "./operational-reports.mjs";

export const reportingMethods = {
  async getIncidentVolumeReport(options) { return getIncidentVolumeReport(this, options); },
  async getStockUsageReport(options) { return getStockUsageReport(this, options); },
  async getQaFlagReport(options) { return getQaFlagReport(this, options); }
};
