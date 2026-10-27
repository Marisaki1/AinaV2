# 🌸 Aina v2 — Your AI Daughter Discord Bot
> Built with discord.js v14 + Groq AI + node-cron

**Creature authoring standard:** Use the [single complete CritterDB/Avrae creation guide](docs/critterdb-avrae-authoring-standard.md): ask follow-up questions before implementation, preserve the user's rules/names, reuse verified standard condition implementations, and validate actual automation. [AGENTS.md](AGENTS.md) requires this workflow. Creature delivery is JSON; additional per-creature Markdown is created only when requested.

**Spellcasting update:** Shared base DC/spell-hit defaults with Fixed exceptions, upcasting controls, editable legendary/resource notes and per-copy local resource trackers are available. Command panels are compact, and new Discord previews use Confirm / Reaction / Cancel. [Setup and exact behavior](docs/spellcasting-and-preview-controls.md) ? [Updated Seija JSON](exports/Seija_Kijin_CritterDB_Avrae.json).

**Critical ranges and player targets:** Combat has critical radio buttons, a custom critical minimum, bonus steppers and damage-die/type selectors. Creature editing can export a passive critical-range trait with native attack automation. Initiative independently includes Sanae, Shuu, Reisen and Byron without adding them to CritterDB. See [instructions and verification](docs/critical-ranges-and-players.md).

**Custom ability tools:** Configure existing abilities with a before/after review, separate ending buttons such as Stand up, damage/save ordering and explicit scaling. Combat offers manual after-roll follow-ups and persistent local use trackers for each encounter copy. See [instructions and verification limits](docs/ability-followups.md).

**Aina command posting:** The **Commands** tab provides filterable saved shortcuts, a custom command field and recent Discord delivery history. Combat, Initiative and Commands share one remembered searchable channel/thread selector. All messages use Aina's existing official bot account. No separate account login or credentials are needed. See [setup and verification](docs/discord-command-sender.md).

**Critter encounter desk:** Run `npm.cmd start`, then open **http://127.0.0.1:4317** yourself. Initiative supports Start Combat, Setup Commands, Remove All, drag ordering and editable values. Combat shows the ordered roster and separate actions/reactions/legendary/traits/saves/checks. The library creates/edits creatures and bestiaries using CritterDB-style sections, selectable defenses and damage types, default save/check modifiers, mixed/choice damage, arbitrary dice and timed effect builders. Export a single creature or full bestiary. Add creatures manually through a filtered dropdown and select targets with checkboxes. Server/channel choices persist. Light/dark themes are available. See the [workflow](docs/critter-workshop.md).

**Workshop updates:** The CritterDB connector is now version **1.0.1**; reload it once at `brave://extensions`, then refresh Aina and reconnect the existing tab. Core/Defense share automatic calculations, unused save/skill selection, half proficiency and roll defaults. Four searchable ability panes, per-combatant Initiative management, and configurable Bleeding/turn-save buttons are available. See [exact behavior, setup and verification](docs/workshop-calculations.md).

**Commands:** Actions and live combat saves/checks use the encounter alias (`!i aoo`, `!i os`, `!i oc`). Source lookup remains available as `!ms` / `!mc`. Aina posts copyable previews; you send them to Avrae.

**Manual combat roster:** In **Initiative**, search the creature dropdown, choose a source, set its combat name and initiative, then add it. **Combat** displays that source's actions, traits, reactions and legendary actions with clickable targets. All dropdowns support search, including channels, damage types and editor settings. Encounter export/setup has been removed from the main app; old mirror links open Initiative.

**Avrae Combat Traits:** Configure save/skill advantage or disadvantage, base check command flags and restricted per-roll choices under **Combat traits**. Review and save the generated integration utility locally, export/update your bestiary, then prepare per-combatant setup commands. Initiative advantage is separate. Application status stays unknown without live verification. See [instructions, exact coverage, audit and test status](docs/avrae-combat-traits.md).

**CritterDB account connection:** Install the local `extensions/aina-critterdb` connector once in your existing Brave profile, then choose **Connect existing tab**. Load creatures or whole bestiaries, review creature changes, and save back to the same account creature with backups, conflict checks and reload verification. Aina never opens a browser. See [setup and verification](docs/critterdb-direct-editing.md).

---

## Quick Setup

### 1. Install
```bash
npm install
```

### 2. Create `.env`
Copy `.env.example` to `.env` and fill in your values:
```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_bot_application_id
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b
```
- **DISCORD_TOKEN** → Discord Developer Portal → Your App → Bot → Reset Token
- **CLIENT_ID** → Discord Developer Portal → Your App → General Information → Application ID
- **GROQ_API_KEY** → [console.groq.com](https://console.groq.com) → API Keys
- **GROQ_MODEL** → Optional chat model override; defaults to `openai/gpt-oss-20b`. If Groq reports `model_not_found`, choose a chat model available to your project and restart Aina.

### 3. Edit `config/config.js`
- Set `dev.guildId` to your Discord server ID (right-click server → Copy Server ID)
- Customize Aina's personality, Groq settings, dungeon settings

### 4. Run
```bash
node index.js       # Normal
npm run dev         # With auto-reload (requires nodemon)
```

### 5. Keep alive (production)
```bash
npm install -g pm2
pm2 start index.js --name aina
pm2 save
```

---

## File Structure

```
aina/
├── assets/images/alarms/    ← Drop alarm images here (.png .jpg .gif)
├── config/
│   ├── config.js            ← ⭐ Your main settings panel
│   └── constants.js         ← Dungeon cell types, emojis, button IDs
├── data/                    ← Auto-created. Alarm, emoji, dungeon data (JSON)
├── history/                 ← Auto-created. Daily logs per category
├── src/
│   ├── cogs/
│   │   ├── ai/index.js      ← /chat, /endchat
│   │   ├── alarm/index.js   ← /alarm set|list|edit|remove|images, /time
│   │   ├── emoji/index.js   ← /emoji stats|sticker-stats|info|scan|clear|tracking
│   │   ├── dungeon/index.js ← /dungeon create|join|leave|status|save|list|load|end
│   │   └── utility/index.js ← /help, /ping
│   ├── events/
│   │   ├── ready.js
│   │   ├── error.js
│   │   ├── messageCreate.js ← @mention AI chat + emoji tracking
│   │   └── interactionCreate.js ← Routes slash commands + dungeon buttons
│   ├── handlers/
│   │   ├── cogHandler.js    ← Auto-loads all cogs
│   │   ├── eventHandler.js  ← Auto-loads all events
│   │   └── historyHandler.js ← Writes to history/ folder by date
│   └── utils/
│       ├── groqClient.js    ← Groq API wrapper
│       ├── memory.js        ← Per-user conversation memory
│       ├── alarmManager.js  ← Alarm data (read/write JSON per guild)
│       ├── alarmScheduler.js ← node-cron job, fires every minute
│       ├── emojiManager.js  ← Emoji + sticker tracking data layer
│       ├── dungeonManager.js ← Dungeon state (movement, floors, save/load)
│       ├── mapGenerator.js  ← Maze generation + fog-of-war renderer
│       └── embed.js         ← Consistent embed builder (purple/green/red/blue)
├── index.js                 ← Entry point
└── package.json
```

---

## Commands

| Command | Description |
|---|---|
| `/alarm set time message [frequency] [channels] [members] [image]` | Set an alarm |
| `/alarm list` | List all alarms |
| `/alarm edit number [fields...]` | Edit an alarm |
| `/alarm remove number` | Delete an alarm |
| `/alarm images` | View available alarm images |
| `/time` | Current Philippine time |
| `/dungeon create [size] [complexity] [floors] [difficulty] [name]` | Create dungeon |
| `/dungeon join/leave/status/save/list/end` | Manage dungeon |
| `/dungeon load id` | Load saved dungeon |
| `/emoji stats [limit]` | Top emoji usage |
| `/emoji sticker-stats [limit]` | Top sticker usage |
| `/emoji info emoji` | Emoji details |
| `/emoji scan [days] [channel]` | Scan message history (Admin) |
| `/emoji tracking` | Usage overview |
| `/chat message` | Chat with Aina |
| `/endchat` | Clear chat memory |
| `/help [category]` | Help menu |
| `/ping` | Latency check |
| @mention Aina | Also starts AI chat |

---

## Adding Alarm Images
Drop any `.png`, `.jpg`, `.gif`, or `.webp` image into `assets/images/alarms/`.
They'll appear in `/alarm images` and can be used with `/alarm set image:filename.jpg`.

---

## Discord Bot Setup Checklist
- [ ] Bot created at [discord.com/developers/applications](https://discord.com/developers/applications)
- [ ] All **Privileged Intents** enabled (Presence, Server Members, Message Content)
- [ ] Bot invited with scopes: `bot` + `applications.commands`
- [ ] Permissions: Send Messages, Read Message History, View Channels, Use External Emojis, Add Reactions
- [ ] Developer Mode enabled → Server ID copied → pasted into `config.js`
