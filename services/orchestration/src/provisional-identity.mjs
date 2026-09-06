// OpenEMR requires a syntactically valid DOB for native patient creation.
// This value is a technical placeholder only; it is never a verified DOB.
export const PROVISIONAL_DOB_SENTINEL = "1900-01-01";
export const PROVISIONAL_IDENTITY_LABEL = "V-EMS provisional identity";
export const PROVISIONAL_IDENTITY_NOTE = `DOB UNKNOWN: ${PROVISIONAL_DOB_SENTINEL} is a technical placeholder, not a clinical birth date`;
