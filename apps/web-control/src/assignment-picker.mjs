import { escapeHtml } from "./security.mjs";

const VEHICLE_ID_PATTERN = /^AMB-[0-9]{3,}$/;

const TERMINAL_ACTION_BY_STATUS = {
  Assigned: "cancel_assignment",
  Accepted: "stand_down_unit",
  Mobilised: "stand_down_unit",
  Active: "reassign_assignment"
};

export function eligibleVehicles(vehicles) {
  return (vehicles ?? []).filter((vehicle) => vehicle.operational_status === "Available" && vehicle.service_status === "Serviceable");
}

export function eligiblePersonnel(personnel) {
  return (personnel ?? []).filter((member) => member.operational_status === "Available");
}

export function terminalActionForReassignment(status) {
  const action = TERMINAL_ACTION_BY_STATUS[status];
  if (!action) throw new Error(`Assignment in status "${status}" cannot be reassigned from the console.`);
  return action;
}

export function buildAssignmentPayload(formData) {
  const vehicleId = String(formData.get("vehicle_id") ?? "").trim();
  const crewIds = formData.getAll("crew_ids").map((id) => String(id).trim()).filter(Boolean);
  const reason = String(formData.get("reason") ?? "").trim();
  const errors = [];
  if (!VEHICLE_ID_PATTERN.test(vehicleId)) errors.push("Select a vehicle.");
  if (crewIds.length === 0) errors.push("Select at least one crew member.");
  if (!reason) errors.push("Enter a reason for this assignment.");
  if (errors.length) return { payload: null, errors };
  return { payload: { vehicle_id: vehicleId, crew_ids: [...new Set(crewIds)].sort(), reason }, errors: [] };
}

function optionHtml(vehicle) {
  const id = escapeHtml(vehicle.vehicle_id);
  const label = escapeHtml(vehicle.callsign ?? vehicle.vehicle_type ?? "");
  return `<option value="${id}">${id} — ${label}</option>`;
}

function checkboxHtml(member) {
  const id = escapeHtml(member.staff_id);
  const label = escapeHtml(member.full_name ?? member.role ?? "");
  return `
    <label class="assignment-crew-option">
      <input type="checkbox" name="crew_ids" value="${id}" />
      ${id} — ${label}
    </label>
  `;
}

export function renderAssignmentPickerHtml({ vehicles, personnel, currentAssignment = null } = {}) {
  const vehicleOptions = vehicles.map(optionHtml).join("\n");
  const crewOptions = personnel.map(checkboxHtml).join("\n");
  const isReassign = Boolean(currentAssignment);
  const heading = isReassign
    ? `Reassign unit (currently ${escapeHtml(currentAssignment.assignment_id)} • ${escapeHtml(currentAssignment.status)} • ${escapeHtml(currentAssignment.vehicle_id)})`
    : "Assign unit";
  const submitLabel = isReassign ? "Reassign unit" : "Assign unit";
  const emptyNote = vehicles.length === 0
    ? '<p class="hint">No vehicles are currently Available and Serviceable.</p>'
    : personnel.length === 0
      ? '<p class="hint">No personnel are currently Available.</p>'
      : "";

  return `
    <section class="panel assignment-picker" aria-labelledby="assignmentPickerHeading">
      <h3 id="assignmentPickerHeading">${heading}</h3>
      ${emptyNote}
      <form id="assignmentPickerForm" data-reassign="${isReassign}" data-current-assignment-id="${escapeHtml(currentAssignment?.assignment_id ?? "")}" data-current-assignment-status="${escapeHtml(currentAssignment?.status ?? "")}">
        <label>Vehicle
          <select name="vehicle_id" required>
            <option value="">Select a vehicle</option>
            ${vehicleOptions}
          </select>
        </label>
        <fieldset>
          <legend>Crew</legend>
          ${crewOptions || '<p class="hint">No eligible crew.</p>'}
        </fieldset>
        <label>Reason<textarea name="reason" rows="2" required></textarea></label>
        <button type="submit" id="assignmentPickerSubmit">${submitLabel}</button>
        <p id="assignmentPickerFeedback" aria-live="polite"></p>
      </form>
    </section>
  `;
}
