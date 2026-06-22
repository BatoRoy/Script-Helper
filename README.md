# Script Helper & Cheat Sheet (D&D5e)

Makes scripting custom items, spells and macros in Foundry VTT **v12** (dnd5e
system) much easier in two ways:

1. **A short, well-named helper API** so you stop memorising data paths.
2. **A live, searchable cheat-sheet panel** so you can look up the exact name
   of anything on the selected actor.

## The helper API (`SH`)

After the world loads, a global `SH` is available in macros and the console.
Most functions take the actor to act on as the first argument — but you can
**omit it** to use the currently selected token (then your assigned
character). So in a typical Item Macro you just write `SH.mod("dex")`.

```js
SH.mod("dex")          // dexterity modifier
SH.score("str")        // strength score
SH.save("wis")         // wisdom save bonus
SH.prof()              // proficiency bonus
SH.skill("ath")        // athletics total
SH.passive("prc")      // passive perception
SH.ac()                // armor class
SH.spellDC()           // spell save DC
SH.hp()                // { value, max, temp, tempmax }
SH.level()             // total level
SH.level("wizard")     // levels in a class

SH.get("attributes.movement.walk")     // read any path under system.*
SH.set("attributes.hp.temp", 5)        // write any path under system.*

SH.damage(SH.target(), 7)              // apply 7 damage (temp HP first)
SH.heal(10)                            // heal the selected token

await SH.roll("2d6 + @abilities.str.mod", null, { flavor: "Smite" })

SH.effects()                           // names of active effects
SH.hasEffect("Blessed")
SH.addEffect({ name: "Blessed", seconds: 60,
  changes: [{ key: "system.bonuses.All.attack", mode: 2, value: "1d4" }] })
SH.removeEffect("Blessed")

SH.target()    // actor of your first targeted token
SH.targets()   // all targeted tokens
SH.selected()  // your selected tokens
SH.nearby(null, 30)   // tokens within 30 ft of the selected token

SH.chat("The blade glows.")            // quick chat message, spoken by the actor
SH.help()                              // list everything in the console
```

`mode: 2` in effect changes means ADD. See the cheat sheet / DAE for keys.

## The cheat sheet

Open it with the **table icon in the Token toolbar** (left side of the canvas)
or by running `SH.cheatsheet()`. It lists every roll-data path for the selected
token alongside its current value. Type in the filter box to narrow it down,
and click any row to copy it — with the `@` prefix it's ready to paste into a
roll formula.

Because the paths shown are exactly what `@...` resolves to, this is the
fastest way to discover "what is this thing called?".

## Install

Drop this folder into your Foundry `Data/modules/` directory and enable
**Script Helper & Cheat Sheet (D&D5e)** in your world's module settings.

## Pairs well with

- **Item Macro** — attach a macro to an item; `SH` is available inside it.
- **Build-a-Bonus** and **DAE** — for no-code bonuses and effects when you
  don't need a script at all.
