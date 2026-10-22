// PeakTalent Auditor - team sync settings (v11.8.0). TEMPLATE: copy this file to team-config.js in the same folder and
// fill in the values. team-config.js is NOT in git (the extension repo is public): share it with reviewers privately,
// inside the extension folder you send them. Without team-config.js the extension works as before, without team sync.
self.PT_TEAM = {
  relay: "https://pt-auditor-relay.YOUR-NAME.workers.dev",   // the Cloudflare worker
  key: "REPLACE-WITH-THE-TEAM-KEY",                           // the same value as the TEAM_KEY secret in Cloudflare
  salt: "REPLACE-WITH-THE-HASH-SALT",                         // any long random text; every reviewer must have the same one
};
