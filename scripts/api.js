/**
 * Script Helper — Helper API
 * --------------------------
 * A set of short, well-named functions wrapping the things you reach for
 * constantly when scripting D&D5e items, spells and macros. The point is to
 * stop you memorising data paths like `actor.system.abilities.dex.mod`.
 *
 * Everything is exposed on the global `SH` (and on the module's `api`), e.g.
 *
 *   SH.mod("dex")            // dexterity modifier of the selected token
 *   SH.prof()                // proficiency bonus
 *   SH.skill(actor, "ath")   // athletics total
 *   await SH.roll("1d8 + @abilities.str.mod")
 *   await SH.damage(SH.target(), 7)
 *
 * The first argument of most functions is the actor to act on. You can pass:
 *   - an Actor                       SH.mod(myActor, "dex")
 *   - a Token / TokenDocument        SH.mod(token, "dex")
 *   - a name, id or "Actor.xxxx"     SH.mod("Aragorn", "dex")
 *   - nothing                        SH.mod("dex")   ← uses selected token,
 *                                    then your assigned character
 *
 * Because "no actor" falls back to the selected token, in a typical macro you
 * can simply write `SH.mod("dex")` and it just works.
 */

/**
 * Resolve whatever the caller passed into a concrete Actor.
 * @param {Actor|TokenDocument|Token|string|null|undefined} ref
 * @returns {Actor|null}
 */
function resolveActor(ref) {
  // Nothing passed → selected token, else the user's assigned character.
  if (ref === undefined || ref === null) {
    return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
  }
  if (ref instanceof Actor) return ref;
  // Token or TokenDocument both expose `.actor`.
  if (ref?.actor instanceof Actor) return ref.actor;
  if (typeof ref === "string") {
    return (
      game.actors.get(ref) ??
      game.actors.getName(ref) ??
      canvas?.tokens?.placeables?.find((t) => t.name === ref)?.actor ??
      null
    );
  }
  return null;
}

/**
 * Resolve the relevant token for an actor (for distance/positioning helpers).
 * @param {Actor|null} actor
 * @returns {Token|null}
 */
function resolveToken(actor) {
  return (
    canvas?.tokens?.controlled?.[0] ??
    actor?.getActiveTokens?.()?.[0] ??
    null
  );
}

/** A small label for warnings, so console messages are traceable. */
const TAG = "script-helper |";

/**
 * Build the public API object. Called once on `ready`.
 * @returns {object} the `SH` helper namespace
 */
export function createApi() {
  const api = {
    // --- Resolution / introspection -------------------------------------

    /** Resolve and return the actor a call would act on (handy for debugging). */
    actor: (ref) => resolveActor(ref),

    /** The actor of the currently selected token (or your character). */
    me: () => resolveActor(),

    /** The full roll-data object — exactly what `@...` paths resolve against. */
    rollData: (ref) => resolveActor(ref)?.getRollData?.() ?? {},

    // --- Core stats -----------------------------------------------------

    /** Ability modifier, e.g. SH.mod("dex"). */
    mod: (ref, ability) => {
      const [a, abl] = _shift(ref, ability);
      return resolveActor(a)?.system?.abilities?.[abl]?.mod ?? null;
    },

    /** Ability score, e.g. SH.score("str"). */
    score: (ref, ability) => {
      const [a, abl] = _shift(ref, ability);
      return resolveActor(a)?.system?.abilities?.[abl]?.value ?? null;
    },

    /** Saving-throw total bonus for an ability, e.g. SH.save("wis"). */
    save: (ref, ability) => {
      const [a, abl] = _shift(ref, ability);
      return resolveActor(a)?.system?.abilities?.[abl]?.save ?? null;
    },

    /** Proficiency bonus. */
    prof: (ref) => resolveActor(ref)?.system?.attributes?.prof ?? null,

    /** Skill total bonus, e.g. SH.skill("ath"). Use the 3-letter dnd5e key. */
    skill: (ref, key) => {
      const [a, k] = _shift(ref, key);
      return resolveActor(a)?.system?.skills?.[k]?.total ?? null;
    },

    /** Passive (10 + bonus) score for a skill, e.g. SH.passive("prc"). */
    passive: (ref, key) => {
      const [a, k] = _shift(ref, key);
      return resolveActor(a)?.system?.skills?.[k]?.passive ?? null;
    },

    /** Armor class value. */
    ac: (ref) => resolveActor(ref)?.system?.attributes?.ac?.value ?? null,

    /** Spell save DC. */
    spellDC: (ref) => resolveActor(ref)?.system?.attributes?.spelldc ?? null,

    /** HP object: { value, max, temp, tempmax }. */
    hp: (ref) => {
      const hp = resolveActor(ref)?.system?.attributes?.hp;
      return hp ? { ...hp } : null;
    },

    /**
     * Character level. With no class key, the total level.
     * With a class name/id, that class's level, e.g. SH.level("wizard").
     */
    level: (ref, cls) => {
      const [a, c] = _shift(ref, cls);
      const actor = resolveActor(a);
      if (!actor) return null;
      if (!c) return actor.system?.details?.level ?? null;
      const item = actor.items.find(
        (i) => i.type === "class" && (i.name.toLowerCase() === String(c).toLowerCase() || i.identifier === c)
      );
      return item?.system?.levels ?? 0;
    },

    // --- Generic get / set ---------------------------------------------

    /**
     * Read any data path relative to `actor.system`, with a fallback to the
     * actor itself. SH.get("attributes.movement.walk") → the walk speed.
     */
    get: (ref, path) => {
      const [a, p] = _shift(ref, path);
      const actor = resolveActor(a);
      if (!actor || !p) return undefined;
      const fromSystem = foundry.utils.getProperty(actor.system, p);
      return fromSystem !== undefined ? fromSystem : foundry.utils.getProperty(actor, p);
    },

    /** Write a data path relative to `actor.system`. Returns the update promise. */
    set: (ref, path, value) => {
      // set(path, value) shorthand when first arg looks like a path.
      let actorRef = ref, p = path, v = value;
      if (value === undefined && typeof path !== "string") {
        actorRef = undefined; p = ref; v = path;
      }
      const actor = resolveActor(actorRef);
      if (!actor || !p) return Promise.resolve(null);
      return actor.update({ [`system.${p}`]: v });
    },

    // --- HP changes -----------------------------------------------------

    /** Apply damage, spending temp HP first. Returns the update promise. */
    damage: (ref, amount) => {
      const [a, amt] = _shift(ref, amount);
      const actor = resolveActor(a);
      const hp = actor?.system?.attributes?.hp;
      if (!hp) return Promise.resolve(null);
      let remaining = Math.max(0, Number(amt) || 0);
      let temp = hp.temp || 0;
      const absorbed = Math.min(temp, remaining);
      temp -= absorbed;
      remaining -= absorbed;
      const value = Math.max(0, hp.value - remaining);
      return actor.update({
        "system.attributes.hp.value": value,
        "system.attributes.hp.temp": temp,
      });
    },

    /** Heal, capped at max (+ tempmax). Returns the update promise. */
    heal: (ref, amount) => {
      const [a, amt] = _shift(ref, amount);
      const actor = resolveActor(a);
      const hp = actor?.system?.attributes?.hp;
      if (!hp) return Promise.resolve(null);
      const ceiling = (hp.max || 0) + (hp.tempmax || 0);
      const value = Math.min(ceiling, hp.value + (Number(amt) || 0));
      return actor.update({ "system.attributes.hp.value": value });
    },

    // --- Rolling --------------------------------------------------------

    /**
     * Evaluate a roll using the actor's roll data, so `@...` references work.
     * Posts to chat by default. Returns the evaluated Roll.
     *   await SH.roll("2d6 + @abilities.str.mod", actor, { flavor: "Smite" });
     */
    roll: async (formula, ref, { flavor, toChat = true } = {}) => {
      const actor = resolveActor(ref);
      const data = actor?.getRollData?.() ?? {};
      const r = await new Roll(String(formula), data).evaluate();
      if (toChat) {
        await r.toMessage({
          flavor,
          speaker: actor ? ChatMessage.getSpeaker({ actor }) : undefined,
        });
      }
      return r;
    },

    // --- Active effects -------------------------------------------------

    /** Names of effects currently on the actor. */
    effects: (ref) => (resolveActor(ref)?.effects?.contents ?? []).map((e) => e.name),

    /** Whether the actor has an effect with this name. */
    hasEffect: (ref, name) => {
      const [a, n] = _shift(ref, name);
      return (resolveActor(a)?.effects?.contents ?? []).some((e) => e.name === n);
    },

    /**
     * Add a simple active effect.
     *   SH.addEffect({ name: "Blessed", icon: "icons/svg/aura.svg",
     *                  seconds: 60, changes: [
     *                    { key: "system.bonuses.All.attack", mode: 2, value: "1d4" } ] });
     */
    addEffect: (ref, data) => {
      // addEffect({...}) shorthand.
      let actorRef = ref, d = data;
      if (data === undefined && typeof ref === "object" && !(ref instanceof Actor) && !ref?.actor) {
        actorRef = undefined; d = ref;
      }
      const actor = resolveActor(actorRef);
      if (!actor || !d?.name) return Promise.resolve(null);
      const effect = {
        name: d.name,
        icon: d.icon ?? "icons/svg/aura.svg",
        changes: d.changes ?? [],
        disabled: false,
        duration: d.seconds ? { seconds: d.seconds } : {},
      };
      return actor.createEmbeddedDocuments("ActiveEffect", [effect]);
    },

    /** Remove the first effect matching this name. */
    removeEffect: (ref, name) => {
      const [a, n] = _shift(ref, name);
      const actor = resolveActor(a);
      const effect = actor?.effects?.contents?.find((e) => e.name === n);
      return effect ? effect.delete() : Promise.resolve(null);
    },

    // --- Targets, selection, positioning --------------------------------

    /** The tokens you currently have targeted (the diamond markers). */
    targets: () => Array.from(game.user?.targets ?? []),

    /** The actor of your first targeted token. */
    target: () => Array.from(game.user?.targets ?? [])[0]?.actor ?? null,

    /** The tokens you currently have selected. */
    selected: () => canvas?.tokens?.controlled ?? [],

    /**
     * Tokens within `range` scene-distance units of the actor's token.
     *   SH.nearby(actor, 30)  // everything within 30 ft
     */
    nearby: (ref, range, { includeSelf = false } = {}) => {
      const [a, r] = _shift(ref, range);
      const origin = resolveToken(resolveActor(a));
      if (!origin || !canvas?.grid) return [];
      const gridSize = canvas.grid.size;
      const unitsPerSquare = canvas.grid.distance;
      return canvas.tokens.placeables.filter((t) => {
        if (!includeSelf && t === origin) return false;
        const dx = t.center.x - origin.center.x;
        const dy = t.center.y - origin.center.y;
        const dist = (Math.hypot(dx, dy) / gridSize) * unitsPerSquare;
        return dist <= r;
      });
    },

    // --- Chat -----------------------------------------------------------

    /** Post a quick chat message, spoken by the actor if one is in scope. */
    chat: (ref, content) => {
      // chat("text") shorthand.
      let actorRef = ref, body = content;
      if (content === undefined) {
        actorRef = undefined; body = ref;
      }
      const actor = resolveActor(actorRef);
      return ChatMessage.create({
        content: String(body),
        speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
      });
    },

    // --- Discovery ------------------------------------------------------

    /** Print the available helpers and a couple of examples to the console. */
    help: () => {
      const lines = [
        "Script Helper (SH) — available functions:",
        "  SH.mod(a,'dex')   SH.score(a,'str')   SH.save(a,'wis')",
        "  SH.prof(a)        SH.skill(a,'ath')   SH.passive(a,'prc')",
        "  SH.ac(a)          SH.spellDC(a)       SH.hp(a)   SH.level(a,'wizard')",
        "  SH.get(a,'path')  SH.set(a,'path',v)",
        "  SH.damage(a,n)    SH.heal(a,n)",
        "  await SH.roll('1d8 + @abilities.str.mod', a, {flavor})",
        "  SH.effects(a)  SH.hasEffect(a,n)  SH.addEffect(a,{...})  SH.removeEffect(a,n)",
        "  SH.target()  SH.targets()  SH.selected()  SH.nearby(a, 30)",
        "  SH.chat(a,'text')   SH.rollData(a)   SH.cheatsheet()",
        "",
        "'a' is optional — omit it to use the selected token. Open the live",
        "path browser with SH.cheatsheet() or the toolbar button.",
      ];
      console.log(`%c${lines.join("\n")}`, "color:#4b9");
      return lines.join("\n");
    },
  };

  return api;
}

/**
 * Allow every stat helper to be called either as fn(actor, key) or fn(key)
 * (with the actor defaulting to the selected token). If the first argument
 * looks like a bare key/number and the second is missing, shift it over.
 * @returns {[any, any]} [actorRef, key]
 */
function _shift(first, second) {
  if (second === undefined && (typeof first === "string" || typeof first === "number")) {
    // Could be either a key (SH.mod("dex")) or an actor name. We bias toward
    // "it's the key" because that's overwhelmingly the macro use-case. If you
    // really mean an actor by name, pass the key explicitly as the 2nd arg.
    return [undefined, first];
  }
  return [first, second];
}
