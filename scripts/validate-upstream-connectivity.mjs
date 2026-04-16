import { runConfiguredConnectivityValidation } from "./connectivity-lib.mjs";

runConfiguredConnectivityValidation(process.env)
  .then((summary) => {
    console.log(JSON.stringify({ ok: true, summary }, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      message: error.message,
      classification: error.classification ?? error.code ?? "CONNECTIVITY_VALIDATION_FAILED",
      details: error.details ?? {}
    }, null, 2));
    process.exitCode = 1;
  });
