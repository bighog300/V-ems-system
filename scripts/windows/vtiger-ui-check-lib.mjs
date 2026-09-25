// Pure HTML analysis helpers for the Vtiger UI gate (no I/O, unit tested).
export const MODULES = ['HelpDesk', 'VEMSAssignments', 'VEMSVehicles', 'VEMSPersonnel', 'VEMSAssignmentCrew', 'VEMSStockItems', 'VEMSVehicleStock', 'VEMSStockUsage'];

const WARNING = /<b>(Warning|Notice|Deprecated|Fatal error)<\/b>:\s+([^<]{0,90})/g;
const text = (fragment) => fragment.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export function phpWarnings(html) {
  return [...new Set([...html.matchAll(WARNING)].map((m) => `${m[1]}: ${m[2].replace(/\s+in\s*$/, '').trim()}`))];
}

export function analyzeList(html) {
  const rows = [...html.matchAll(/<tr[^>]*class="[^"]*listViewEntries[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)];
  const headers = [...html.matchAll(/class="listViewContentHeaderValues"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => text(m[1])).filter(Boolean);
  const firstRowCells = rows.length ? [...rows[0][1].matchAll(/<td[^>]*class="[^"]*listViewEntryValue[^"]*"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1])) : [];
  const id = rows.length ? (rows[0][0].match(/data-id=['"](\d+)['"]/) || [])[1] : undefined;
  return {
    rows: rows.length,
    firstRecordId: id,
    recordIds: rows.map((r) => (r[0].match(/data-id=['"](\d+)['"]/) || [])[1]).filter(Boolean),
    headerColumns: headers.length,
    valueCells: firstRowCells.length,
    blankValueCells: firstRowCells.filter((c) => !c).length,
    populatedValueCells: firstRowCells.filter((c) => c).length,
    warnings: phpWarnings(html),
  };
}

export function analyzeDetail(html, ownModule) {
  const buttons = [...html.matchAll(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/g)].map((m) => text(m[1]));
  return {
    fieldLabels: [...html.matchAll(/<td[^>]*class="[^"]*fieldLabel[^"]*"[^>]*>/g)].length,
    editControl: buttons.some((b) => b === 'Edit'),
    linkedReferenceFields: [...html.matchAll(/<td[^>]*class="[^"]*fieldValue[^"]*"[^>]*>[\s\S]{0,300}?<a[^>]*href="[^"]*record=\d+/g)].length,
    // Modules that record links on the page point to, excluding the page's own module (e.g. an assignment
    // links to HelpDesk and VEMSVehicles). Sidebar/menu links use view=List, so only record links match.
    referenceTargets: [...new Set([...html.matchAll(/href=["'][^"']*module=(HelpDesk|VEMS\w+)&(?:amp;)?view=Detail&(?:amp;)?record=\d+/g)].map((m) => m[1]))].filter((m) => m !== ownModule).sort(),
    relatedTabs: [...new Set([...html.matchAll(/data-label-key="([^"]+)"/g)].map((m) => m[1]))],
    warnings: phpWarnings(html),
  };
}

// Record ids of a module that a page links to (record links only; menu links use view=List).
export function recordLinks(html, module) {
  const link = new RegExp(`href=["'][^"']*module=${module}&(?:amp;)?view=Detail&(?:amp;)?record=(\\d+)`, 'g');
  return [...new Set([...html.matchAll(link)].map((m) => m[1]))];
}

// A related-list panel: how many rows it shows and whether they link to records of the source module.
export function analyzeRelated(html, sourceModule) {
  const rows = [...html.matchAll(/<tr[^>]*class="[^"]*listViewEntries[^"]*"/g)].length;
  const link = new RegExp(`href=["'][^"']*module=${sourceModule}&(?:amp;)?view=Detail&(?:amp;)?record=\\d+`);
  return { rows, linksToSource: link.test(html), warnings: phpWarnings(html) };
}

export function isImportDenied(html) {
  return /Permission denied/i.test(text(html)) && !/type="file"/i.test(html);
}

// Modules the app menu links to (list-page links on the dashboard), sorted and de-duplicated.
export function menuModules(html) {
  return [...new Set([...html.matchAll(/href=["']index\.php\?module=(\w+)&(?:amp;)?view=List/g)].map((m) => m[1]))].sort();
}

// The bare "Permission denied" page (not merely the words inside a larger page).
export function isPermissionDeniedPage(html) {
  return /Permission denied/i.test(text(html)) && text(html).length < 400;
}
