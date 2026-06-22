/**
 * Script Helper — Cheat Sheet panel
 * ---------------------------------
 * A small, searchable window that lists the selected token's roll-data paths
 * and their current values. The paths shown are exactly what `@...` resolves
 * to inside a roll formula, so it directly answers "what is this called?".
 *
 * Click any row to copy it. With the "@ prefix" box ticked you get a string
 * ready to drop into a formula (e.g. `@abilities.dex.mod`); unticked you get
 * the bare path. The panel re-reads the selected token whenever you change
 * selection, so the values stay live.
 *
 * Built on the classic Application class (rather than a Handlebars template)
 * so the whole module ships as plain script files with no separate assets.
 */

/**
 * Flatten a roll-data object into a sorted list of { path, value } leaves.
 * @param {object} obj            the object to flatten (usually getRollData())
 * @param {string} [prefix]       internal — current path prefix
 * @param {Array}  [out]          internal — accumulator
 * @param {number} [depth]        internal — recursion guard
 * @returns {Array<{path:string,value:string}>}
 */
export function flattenRollData(obj, prefix = "", out = [], depth = 0) {
  if (depth > 6) return out;
  for (const [key, value] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      out.push({ path, value: String(value) });
    } else if (typeof value === "function") {
      // Skip methods — they aren't usable in formulas.
    } else if (Array.isArray(value)) {
      if (value.length === 0) out.push({ path, value: "[]" });
      else flattenRollData({ ...value }, path, out, depth + 1);
    } else if (typeof value === "object") {
      flattenRollData(value, path, out, depth + 1);
    } else {
      out.push({ path, value: typeof value === "string" ? value : String(value) });
    }
  }
  return depth === 0 ? out.sort((a, b) => a.path.localeCompare(b.path)) : out;
}

/** Escape a string for safe insertion into HTML. */
function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

export class CheatSheet extends Application {
  /** @type {CheatSheet|null} the single live instance */
  static _instance = null;

  /** Open the panel, or close it if it's already open. */
  static toggle() {
    if (CheatSheet._instance?.rendered) {
      CheatSheet._instance.close();
    } else {
      (CheatSheet._instance ??= new CheatSheet()).render(true);
    }
  }

  /** Re-render if open (e.g. when the selected token changes). */
  static refresh() {
    if (CheatSheet._instance?.rendered) CheatSheet._instance.render(false);
  }

  constructor(...args) {
    super(...args);
    /** Whether copied paths get an `@` prefix (formula-ready). */
    this._prefix = true;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "script-helper-cheatsheet",
      classes: ["script-helper-cheatsheet"],
      title: "Roll Data Cheat Sheet",
      width: 440,
      height: 620,
      resizable: true,
      popOut: true,
    });
  }

  /** The actor whose data we display: selected token, then your character. */
  get _actor() {
    return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
  }

  /**
   * Build the window contents directly as jQuery, bypassing template loading.
   * @returns {Promise<JQuery>}
   */
  async _renderInner() {
    const actor = this._actor;
    const rows = actor ? flattenRollData(actor.getRollData()) : [];

    const style = `
      <style>
        .script-helper-cheatsheet .sh-head { padding: 6px 8px; border-bottom: 1px solid var(--color-border-light-tertiary); }
        .script-helper-cheatsheet .sh-actor { font-weight: bold; margin-bottom: 4px; }
        .script-helper-cheatsheet .sh-search { width: 100%; box-sizing: border-box; }
        .script-helper-cheatsheet .sh-opts { font-size: 11px; opacity: 0.8; margin-top: 4px; }
        .script-helper-cheatsheet .sh-list { padding: 0; margin: 0; list-style: none; overflow-y: auto; }
        .script-helper-cheatsheet .sh-row { display: flex; justify-content: space-between; gap: 8px;
          padding: 3px 8px; cursor: pointer; border-bottom: 1px solid rgba(0,0,0,0.05); }
        .script-helper-cheatsheet .sh-row:hover { background: var(--color-bg-option, rgba(50,100,255,0.12)); }
        .script-helper-cheatsheet .sh-path { font-family: monospace; color: var(--color-text-dark-primary); }
        .script-helper-cheatsheet .sh-val { font-family: monospace; opacity: 0.7; text-align: right;
          max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .script-helper-cheatsheet .sh-empty { padding: 16px; text-align: center; opacity: 0.7; }
      </style>`;

    const header = `
      <div class="sh-head">
        <div class="sh-actor">${actor ? esc(actor.name) : "No token selected"}</div>
        <input type="text" class="sh-search" placeholder="Filter paths… (e.g. dex, hp, prof)" />
        <label class="sh-opts"><input type="checkbox" class="sh-prefix" ${this._prefix ? "checked" : ""}/> Copy with <code>@</code> prefix (for roll formulas)</label>
      </div>`;

    const body = actor
      ? `<ul class="sh-list">${rows
          .map(
            (r) =>
              `<li class="sh-row" data-path="${esc(r.path)}"><span class="sh-path">@${esc(
                r.path
              )}</span><span class="sh-val">${esc(r.value)}</span></li>`
          )
          .join("")}</ul>`
      : `<div class="sh-empty">Select a token to see its roll-data paths.</div>`;

    return $(`<div class="sh-wrap">${style}${header}${body}</div>`);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0] ?? html;

    // Live substring filter over the rows — no re-render, so focus is kept.
    const search = root.querySelector(".sh-search");
    search?.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      for (const row of root.querySelectorAll(".sh-row")) {
        const path = row.dataset.path.toLowerCase();
        row.style.display = !q || path.includes(q) ? "" : "none";
      }
    });

    // Remember the prefix preference.
    const prefix = root.querySelector(".sh-prefix");
    prefix?.addEventListener("change", () => {
      this._prefix = prefix.checked;
    });

    // Click a row to copy its path.
    for (const row of root.querySelectorAll(".sh-row")) {
      row.addEventListener("click", () => {
        const path = row.dataset.path;
        const text = this._prefix ? `@${path}` : path;
        game.clipboard.copyPlainText(text);
        ui.notifications.info(`Copied: ${text}`);
      });
    }
  }
}
