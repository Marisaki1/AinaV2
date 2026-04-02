# 🌸 Aina v2 — Your AI Daughter Discord Bot
> Built with discord.js v14 + Groq AI + node-cron

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
```
- **DISCORD_TOKEN** → Discord Developer Portal → Your App → Bot → Reset Token
- **CLIENT_ID** → Discord Developer Portal → Your App → General Information → Application ID
- **GROQ_API_KEY** → [console.groq.com](https://console.groq.com) → API Keys

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
