import { ASSIGNMENT_STATUSES, INCIDENT_STATUSES } from "./enums.mjs";

const incidentTransitions = {
  "New:queue_for_dispatch": "Awaiting Dispatch",
  "Awaiting Dispatch:assign_resource": "Assigned",
  "Awaiting Dispatch:cancel_incident": "Cancelled",
  "Assigned:acknowledge_assignment": "Crew Acknowledged",
  "Assigned:stand_down": "Stood Down",
  "Crew Acknowledged:depart_to_scene": "En Route",
  "Crew Acknowledged:stand_down": "Stood Down",
  "En Route:arrive_scene": "On Scene",
  "En Route:stand_down": "Stood Down",
  "On Scene:begin_treatment": "Treating On Scene",
  "On Scene:begin_transport": "Transporting",
  "On Scene:stand_down": "Stood Down",
  "Treating On Scene:begin_transport": "Transporting",
  "Treating On Scene:complete_non_transport_handover": "Handover Complete",
  "Transporting:arrive_destination": "At Destination",
  "At Destination:complete_handover": "Handover Complete",
  "Handover Complete:close_incident": "Closed"
};

const assignmentTransitions = {
  "Proposed:confirm_assignment": "Assigned",
  "Assigned:accept_assignment": "Accepted",
  "Assigned:cancel_assignment": "Cancelled",
  "Accepted:mobilise_unit": "Mobilised",
  "Accepted:stand_down_unit": "Stood Down",
  "Mobilised:activate_assignment": "Active",
  "Mobilised:stand_down_unit": "Stood Down",
  "Active:complete_assignment": "Completed",
  "Active:reassign_assignment": "Reassigned",
  "Reassigned:confirm_assignment": "Assigned"
};

export function nextIncidentStatus(current, action) {
  if (!INCIDENT_STATUSES.includes(current)) throw new Error(`Unknown incident status: ${current}`);
  const next = incidentTransitions[`${current}:${action}`];
  if (!next) throw new Error(`INVALID_STATUS_TRANSITION: Incident ${current} -> ${action}`);
  return next;
}

export function nextAssignmentStatus(current, action) {
  if (!ASSIGNMENT_STATUSES.includes(current)) throw new Error(`Unknown assignment status: ${current}`);
  const next = assignmentTransitions[`${current}:${action}`];
  if (!next) throw new Error(`INVALID_STATUS_TRANSITION: Assignment ${current} -> ${action}`);
  return next;
}
