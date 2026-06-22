/**
 * Script Helper — entry point
 * ---------------------------
 * Wires the helper API onto the global `SH`, registers the cheat-sheet panel,
 * adds a toolbar button to open it, and keeps the panel in sync with the
 * currently selected token.
 */

import { createApi } from "./api.js";
import { CheatSheet } from "./cheatsheet.js";

const MODULE_ID = "script-helper";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initializing`);
});

Hooks.once("ready", () => {
  const api = createApi();

  // A convenience so SH.cheatsheet() opens the panel from anywhere.
  api.cheatsheet = () => CheatSheet.toggle();
  api.CheatSheet = CheatSheet;

  // Expose the API three ways: on the module record, on a short global, and
  // (defensively) on globalThis so it works inside sandboxed macro scopes.
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  globalThis.SH = api;

  console.log(`${MODULE_ID} | ready — helper API available as 'SH'. Try SH.help().`);
});

// Add a button to the Token scene controls that opens the cheat sheet.
Hooks.on("getSceneControlButtons", (controls) => {
  const tokenControls = controls.find((c) => c.name === "token");
  if (!tokenControls) return;
  tokenControls.tools.push({
    name: "script-helper-cheatsheet",
    title: "Roll Data Cheat Sheet",
    icon: "fas fa-table-list",
    button: true,
    visible: true,
    onClick: () => CheatSheet.toggle(),
  });
});

// Keep the cheat sheet showing whatever token is currently selected.
Hooks.on("controlToken", () => CheatSheet.refresh());
