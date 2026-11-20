# Aina

Aina is a Discord companion built with discord.js, Groq, and local JSON storage. She provides conversational AI, scheduled reminders, emoji and sticker statistics, voice synthesis, cooperative dungeon exploration, a Fabula character tracker, and the existing local Critter Workshop.

This README covers installation, operation, permissions, every slash command, persistence, and the limits of each feature. In Discord, use `/help category:<category> page:<number>` for commands loaded by the running bot.

## Contents

- [Install and configure](#install-and-configure)
- [Discord setup and permissions](#discord-setup-and-permissions)
- [Configuration](#configuration)
- [Using each feature](#using-each-feature)
- [Complete command reference](#complete-command-reference)
- [Data, privacy, and backups](#data-privacy-and-backups)
- [Operation and maintenance](#operation-and-maintenance)
- [Development and verification](#development-and-verification)
- [Troubleshooting](#troubleshooting)

## Install and configure

Use **Node.js 22.12.0 or newer**, matching the engine requirement of the locked voice dependency, and npm. Run one Aina process per data directory. Commands below use PowerShell's `npm.cmd`; `npm` works in other shells.

```powershell
npm.cmd ci
Copy-Item .env.example .env
```

Create `.env` only on a new installation. Keep your existing file when upgrading. Set:

```dotenv
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
COMMAND_SCOPE=guild
GUILD_ID=your_server_id
REGISTER_COMMANDS=true
OWNER_ID=your_discord_user_id

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b

ALARM_TIMEZONE=Asia/Manila
TTS_PROVIDER=groq
GROQ_TTS_API_KEY=your_separate_speech_key
GROQ_TTS_MODEL=canopylabs/orpheus-v1-english
GROQ_TTS_VOICE=autumn
TTS_VOICE=en-US-JennyNeural
```

Obtain the bot token and application ID from the [Discord Developer Portal](https://discord.com/developers/applications). Enable Developer Mode in Discord to copy server and user IDs. Get a Groq key from the [Groq console](https://console.groq.com); an accessible chat model is required for AI only. Never commit `.env`.

```powershell
npm.cmd run doctor
npm.cmd start
```

`doctor` loads and serializes command definitions, validates local configuration, and checks voice dependencies and FFmpeg. It does **not** log in, register commands, call Groq, speak, or send messages. A locally configured key is not proof that it works.

On startup Aina opens the existing Critter service, validates configuration, loads cogs/events, optionally registers commands, logs in, and starts alarms after Discord is ready. A failed cog stops registration rather than replacing Discord's commands with an incomplete list. If Discord startup fails while the local Critter service is running, that offline editor remains available and the console reports the error.

Voice dependencies include `opusscript` and a project-local FFmpeg binary. The native `@discordjs/opus` encoder is optional; installation can succeed without its build tools. The speech service still requires internet access. If your platform cannot use the bundled FFmpeg, install FFmpeg on PATH and check `doctor`.

## Discord setup and permissions

Invite the application with the **bot** and **applications.commands** scopes. Enable **Message Content Intent** and **Server Members Intent** in the Developer Portal because this client requests them. Presence Intent is not used. [Discord's intent guide](https://discordjs.guide/legacy/popular-topics/intents) explains the distinction between requested events and channel permissions.

Grant permissions in the channels where a feature will run:

| Feature | Bot permissions and requirements |
| --- | --- |
| General commands, AI, sheets | View Channel, Send Messages, Embed Links; Send Messages in Threads when using threads |
| Alarm images and large dungeon maps | Attach Files |
| Emoji history | Read Message History and View Channel; Message Content Intent for message contents |
| Emoji display and reactions | Use External Emojis where applicable; Add Reactions for workshop reaction controls |
| Voice | View Channel, Connect, Speak in a normal voice channel |
| Alarm DMs | Recipient must accept DMs from the server; delivery can fail independently of channel messages |

Server permission overwrites still apply. Administrator is not required for the bot.

| Action | Who may use it |
| --- | --- |
| Chat, time, help, ping, ordinary emoji statistics | Members with access to the command/channel; chat, time and utility also support DMs |
| Alarm creation | Members with access to the selected destinations |
| Alarm edit/remove | Creator or someone with Manage Server; ownerless legacy alarms require Manage Server |
| Emoji scan/clear | Server Administrator |
| Dungeon movement/inspect | Party members using the current map |
| Dungeon save/end/Flee | Party leader or server Administrator |
| Dungeon load | Saved leader or server Administrator |
| Fabula edits and quick controls | Character owner |
| Fabula viewing | Members can view other server characters using the optional user argument; replies are private to the requester |
| Voice join/say/stop/leave | Members in the destination/current voice channel, or someone with Move Members; moving Aina away from another channel requires Move Members |
| Critter commands | Existing workspace owner authorization |
| Transcript export | Only Marisaki's Discord user ID `113974200267571201`; both Marisaki and Aina must be able to view the selected channel and read its history |

## Configuration

`config/config.js` holds personality, colors, limits, storage paths, and gameplay presets. Environment values override the settings listed below. Restart after changes. Relative paths resolve from the repository, including when a supervisor starts Aina elsewhere.

| Environment variable | Behavior |
| --- | --- |
| `DISCORD_TOKEN` | Required bot token |
| `CLIENT_ID` | Required application ID |
| `COMMAND_SCOPE` | `guild` or `global`. Explicit guild scope requires GUILD_ID. If unset, GUILD_ID selects guild scope; without either, existing global deployments retain global scope. |
| `GUILD_ID` | Server receiving guild-scoped command registration |
| `COMMAND_GUILD_IDS` | Optional comma-separated server IDs receiving additional synchronized copies of all commands. Works alongside global scope; useful for immediate updates in your main server. |
| `REGISTER_COMMANDS` | `true` by default; `false` skips registration on startup. Use true after changing command definitions. |
| `OWNER_ID` | Overrides the existing owner ID in config; used for Aina's Papa greeting/personality |
| `GROQ_API_KEY` | Optional for the rest of the bot; required for AI replies |
| `GROQ_MODEL` | Default `openai/gpt-oss-20b`; choose a chat model accessible to your Groq project |
| `ALARM_TIMEZONE` | IANA timezone; default `Asia/Manila`. `/time` uses the same setting. |
| `TTS_PROVIDER` | Default provider for `/ttv`; `groq` in the example configuration, `edge` if omitted. Plain Message independently selects any of the 14 providers in [the speech guide](docs/tts.md). |
| `GROQ_TTS_API_KEY` | Separate speech key, required for Groq TTS; never falls back to the AI chat key |
| `GROQ_TTS_MODEL` | `canopylabs/orpheus-v1-english` |
| `GROQ_TTS_VOICE` | Default `autumn`; also `diana`, `hannah`, `austin`, `daniel`, `troy`. Plain Message has its own voice selector. |
| `TTS_VOICE` | Edge provider only; default `en-US-JennyNeural` |
| `CRITTER_OWNER_ID` | Existing separate workshop owner override; defaults to Discord application ownership |
| `CRITTER_PORT` | Existing local workshop port; default 4317 |
| `CRITTER_BROWSER_CHANNEL`, `CRITTER_BROWSER_EXECUTABLE_PATH` | Existing legacy browser-test settings; real direct editing uses the existing-tab extension |

The default chat limit is 20 messages (10 completed exchanges) per user/channel, a one-hour idle expiry, and at most 1,000 cached conversations. Requests use a 30-second provider timeout with one retry. Inputs are limited to 4,000 characters; very long responses are shortened to fit Discord.

Alarm defaults: 50 alarms per server; at most 10 channel and 10 member destinations per alarm. Emoji scan defaults: 30 days, at most 365 selectable days, 50,000 messages and 10 minutes per scan. Voice defaults: five accepted speech jobs including the current job, 15-second connection timeout, 30-second synthesis timeout, and 120-second playback timeout.

Dungeon presets remain configurable: sizes 10×10, 15×15, 20×20; floor ranges 1–3, 4–6, 7–10, or 20; three complexity settings; four encounter-density settings. Movement controls expire after five minutes of inactivity by default.

Guild and global registrations are separate Discord records. Switching scope does not delete old registrations in the other scope. `COMMAND_GUILD_IDS` keeps additional server copies synchronized; matching server commands take precedence over their global counterparts. [Discord documents immediate updates for guild commands](https://docs.discord.com/developers/interactions/application-commands). Global changes may take time to appear in Discord clients.

To publish the current commands without starting another bot process, run:

```powershell
npm.cmd run commands:sync
# Publish only to a particular server:
npm.cmd run commands:sync -- --guild YOUR_SERVER_ID
```

This loads every cog, compares Discord's published definitions, updates only changed scopes, and verifies them by reading them back. It never logs in a second gateway client or starts alarms. `REGISTER_COMMANDS=false` skips automatic startup publication; this explicit command still publishes. A successful local test or doctor check does not publish commands. Restart Aina after changing handler code so the running process uses that code too.

## Using each feature

### AI conversation

```text
/chat message:Hello Aina!
/endchat
```

A direct `@Aina` mention in a server also starts chat. A direct message to Aina needs no mention. Role/everyone mentions do not trigger replies. Mentioning another person in the same message preserves that mention as context.

Memory is separate for each **user, server, and channel**. Slash chat and mentions share that channel's conversation. Only complete successful user/assistant pairs enter memory; failed provider calls leave previous history intact. An overlapping request receives a busy response instead of interleaving messages. `/endchat` clears only your current conversation and prevents an already-running response from restoring its history, although the response may still arrive.

Memory is held in RAM and expires or disappears on restart. Normal `/chat` and mention replies are visible in their channel; `/endchat` responds privately. The owner receives the configured Papa personality. AI output does not execute commands or control other features.

### Alarms and time

```text
/alarm set time:08:30 message:Morning reminder frequency:daily members:none image:none
/alarm set time:20:00 message:Game night frequency:weekly weekday:Friday channels:#general
/alarm list
/alarm edit number:1 time:09:00
/alarm remove number:1
/time
```

Times use 24-hour `HH:MM` in the configured timezone. A one-time alarm uses the next occurrence of that time. Daily alarms recur each day; weekly alarms use the selected weekday, or the next occurrence and then the same weekday every week. The weekday picker displays Monday through Sunday (stored as 1 through 7).

Channel input accepts comma-separated names, mentions, or IDs. Use IDs/mentions for duplicate channel names. Member input accepts mentions/IDs. Defaults are the current channel **and the requester as a member destination**, so the requester is pinged in the channel and receives a DM. Set `members:none` to disable pings/DMs or `channels:none` for DM-only delivery. At least one destination is required.

Place PNG, JPG/JPEG, GIF, or WebP files in `assets/images/alarms/`. `/alarm images page:1` lists them. `image:none` disables an image, `image:random` selects one, and a filename selects a specific image. New alarms select a random installed image when the option is omitted; the selected image is stored with the alarm.

The scheduler checks every minute. Persisted overdue occurrences catch up once after downtime; it does not replay every missed day. Successful destinations are recorded independently. Failed destinations retry during that occurrence without resending successful ones; a failed destination does not prevent later recurring occurrences. A one-time alarm is removed only after delivery to all destinations. Check delivery errors in `/alarm list`.

Alarm numbers can change when earlier entries are removed; use a fresh list before editing. Edits reschedule the alarm. A process crash between a Discord send and its local receipt can still cause a duplicate on restart. Alarm delivery cannot be guaranteed while the bot is offline, lacks permissions, or cannot DM a recipient.

Older alarm records without a stored next-occurrence timestamp initialize at their next scheduled time. If you change the timezone and want existing scheduled timestamps to move immediately, re-edit those alarms; their next occurrence is already stored as an absolute time.

### Emoji and sticker statistics

```text
/emoji stats limit:10
/emoji sticker-stats limit:10
/emoji info emoji:<custom server emoji>
/emoji scan days:30 channel:#general
/emoji tracking
```

Aina counts this server's custom emojis in human messages and reactions, plus its stickers. Repeated emoji occurrences in a message count separately. Unicode emojis, other servers' emojis, and bots are excluded. Message edits and reaction changes reconcile recorded counts; repeat scans deduplicate known messages and reaction users.

Human reactions to bot messages still count. Deleted-message usage remains historical; deleting a message is not a statistics reset.

A scan reads accessible cached message channels/threads, or the selected channel. It reports skipped channels, unavailable reaction lists, and time/message limits. Archived or uncached threads and inaccessible/deleted history are not a complete server archive. First/last usage timestamps are observations; historical reactions use the original message date.

Existing statistics from older versions contain totals without message IDs. Those totals are preserved, but the first new scan can overlap them. For a clean rebuild, an administrator can deliberately use `/emoji clear` and then scan. **Clear immediately removes the server's stored totals and deduplication records.** One scan runs per server, and clearing is blocked while it runs.

### Channel transcripts

Use `/transcript` in a server to save a channel or thread's available text history to `data/transcripts/` on the computer running Aina. It defaults to the current channel, scans backward to the beginning, and writes messages in chronological order. Every completed export is kept locally. A file of up to 8 MiB is also attached to the private reply when Discord accepts the upload; larger files remain available locally. Long exports can outlast Discord's interaction response window: check the local folder and bot console if the private reply expires.

Only the Discord user ID `113974200267571201` can run the command, including when `OWNER_ID` is set differently. Both that user and Aina need View Channel and Read Message History. Private threads also require membership or Manage Threads. This exports one selected channel or thread at a time; threads are not included automatically when their parent channel is exported. Deleted messages and history unavailable to the bot cannot be recovered. Enable Message Content Intent for message and embed content.

By default, message text and text from embeds are included, with no dates, image links, or attachment links. Your D&D speaker IDs are labeled `DM:`, `Sanae:`, and `Shuu:`; Aina's specified bot ID is also labeled `DM:`. Other authors use their server display name or Discord username. Formatting and line breaks in messages are kept. Messages with no remaining text after exclusions are omitted.

| `/transcript` option | Effect |
| --- | --- |
| `channel` | Choose a text channel or thread in this server; defaults to the current channel. |
| `text_only` | Set true to omit speaker labels, dates, image links, and all attachment links. |
| `speakers` | Include speaker labels; default true. Set false to omit them. |
| `dates` | Include UTC timestamps; default false. |
| `attachments` | Include links to non-image attachments; default false. Files are not downloaded. |
| `embed_text` | Include titles, descriptions, fields, and other visible embed text; default true. Set false to keep message content only. |
| `images` | Include image attachment links, embedded image links, and direct image URLs in message text; default false. Images are not downloaded. |
| `from_date`, `through_date` | Optional inclusive UTC calendar dates in `YYYY-MM-DD` format. |

Examples: `/transcript` saves the current channel with D&D speaker labels; `/transcript text_only:True` saves text without labels, dates, or attachment links; `/transcript channel:#campaign dates:True from_date:2026-01-01` adds timestamps and starts from that UTC date. `text_only:True` takes precedence over `speakers`, `dates`, `attachments`, and `images`. The `embed_text` option still applies in text-only mode, allowing written bot dialogue to be retained.

Exports contain private channel content and are excluded from Git under `data/`. Back them up only where you intend to retain them. Discord messages may change or disappear while an export is in progress; the result reflects what Discord returned during the scan, and fetching stops before the command's invocation. An interrupted or failed history scan does not create a completed file. Attachments, images, reactions, and thread replies are not archived unless their textual links are explicitly requested or a thread is exported separately.

### Text to voice

```text
/ttv join
/ttv say text:Hello everyone!
/ttv status
/ttv stop
/ttv leave
```

Join a normal voice channel, then ask Aina to join. Each server has one voice connection and an ordered queue. Speech accepts 1–2000 characters after stripping leading Discord quote markers (`>`); a full queue rejects new requests. The response confirms completion after playback. `stop` cancels current and waiting speech while keeping the connection; `leave` cancels and disconnects.

Aina normally leaves when no human members remain. Voice controls require channel membership or Move Members permission. Concurrent requests use separate temporary audio files, which are removed after completion or cancellation. Queue contents are not persisted.

For Groq, set `TTS_PROVIDER=groq` and your separate `GROQ_TTS_API_KEY`, then restart Aina. The model is `canopylabs/orpheus-v1-english`, with `autumn` selected by default. Aina requests WAV audio and splits long narration into ordered segments of at most 200 characters, respecting [Groq Orpheus limits](https://console.groq.com/docs/text-to-speech/orpheus). Segments may have short pauses. Requests are not automatically retried, so a failure after partial playback does not repeat the narration. `/ttv status` and `npm.cmd run doctor` report configuration without exposing the key; configured does not mean live provider access has been verified. To use the Microsoft Edge service for `/ttv`, set `TTS_PROVIDER=edge` and `TTS_VOICE=en-US-GuyNeural` (or another supported Edge voice), then restart.

In the workshop's **Discord Commands → Plain message**, **Enable TTS** is unchecked by default and resets when the page reloads. Join a voice channel, choose the text destination, enable TTS, and select a speech provider, voice, and voice channel in that server. The page starts with **Groq / Autumn**; the voice selector includes all six Groq voices. Choose another provider for free online voices, offline engines, or hosted free quotas. Edge discovers its complete multilingual list, and provider setup/status appears in the panel. Provider and voice choices stay selected while browsing the workshop and reset on page reload. Every submitted narration retains its own choices, even if you change the selector while it waits.

**Send message** automatically connects Aina, posts the exact text, then speaks it. For example, `> Reiko awaits on the mountain.` remains quoted in Discord while the spoken copy omits `>`. **Join voice**, **Stop speech**, and **Leave voice** are also available. The workspace owner must be in the selected voice channel or have Move Members permission. Recent posts tracks text delivery and speech separately and includes the chosen voice. The field clears after Discord confirms text delivery, including if audio later fails; failed or uncertain text delivery keeps the draft. Typing a new draft while delivery is pending protects the new draft from clearing. **Clear** discards the field immediately without posting or cancelling previously submitted messages. See the [sender setup and verification guide](docs/discord-command-sender.md#optional-voice-narration).

### Free speech options

Plain Message supports **14 provider adapters**: Groq, Edge, Windows installed voices, Piper, Kokoro, eSpeak NG, LocalAI/compatible servers, Gemini, ElevenLabs, Cartesia, Azure Speech, Google Cloud TTS, IBM Watson, and Cloudflare Workers AI. Edge loads its complete live multilingual catalog. Other dynamic providers load their installed/account voices and follow hosted pagination. Groq starts on Autumn. Provider setup requirements, voice counts, free-plan conditions and a **Reload voices** control appear in the panel.

| Free access | Providers |
| --- | --- |
| No personal API key | Edge online; Windows, Piper, Kokoro and eSpeak locally |
| Local server and model | LocalAI / compatible engines, including additional supported open-source TTS backends |
| Hosted free quotas | Groq, Gemini Flash TTS, ElevenLabs, Cartesia, Azure F0, IBM Lite, Cloudflare Workers Free |
| Monthly allowance with billing required | Google Cloud TTS; overages may charge |

The [complete speech setup guide](docs/tts.md) covers every provider, environment labels, free limits, model installation, male voice choices, diagnosis, and the distinction between ongoing free plans and trials. Local engine/model licenses still apply. Aina does not create provider accounts or change billing plans.

After installing Piper voices with the commands below, keep a separate terminal running to use it:

```powershell
npm.cmd run tts:serve -- piper
```

For new installations, extra models, and diagnosis:

```powershell
npm.cmd run tts:setup -- piper
npm.cmd run tts:setup -- piper en_US-ryan-high
npm.cmd run tts:voices -- piper
npm.cmd run tts:check -- piper en_US-ryan-high
```

Kokoro has equivalent `tts:setup -- kokoro` and `tts:serve -- kokoro` commands and requires Docker. Windows voices need no model-server process. Models and local environments live under ignored `.tts/`. `tts:check` generates and decodes a short sample and saves it for audition; it does not connect to Discord. Hosted checks consume provider quota.

### Dungeon exploration

```text
/dungeon create size:SMALL complexity:NORMAL floors:SMALL difficulty:NORMAL name:Evening expedition
/dungeon join
/dungeon status
/dungeon save
/dungeon list
/dungeon load id:<save ID>
```

One active dungeon exists per server, with a shared party position and up to 25 members. Move with directional buttons. Inspect describes the current tile; Status refreshes the map. Fog of war remembers revealed cells separately on each floor, and stairs work in both directions. Complexity affects maze generation; difficulty changes trap/enemy/chest density.

This is an **exploration game**. Chests and traps display events when entered; enemies are encounter markers. There is no automatic combat, HP loss, loot inventory, or reward system. Reaching the final goal completes the run. Large maps are attached as text when needed to fit Discord.

Only the newest posted map controls the active run; older/session-mismatched controls are rejected. Use `/dungeon status` to renew expired controls. A departing leader hands leadership to the next party member. If everyone leaves, the active run closes. Ending or fleeing retains existing manual saves.

Active progress is in RAM. **Save before restarting or stopping Aina.** Saving again updates the same save ID. Loads are server-scoped and require the saved leader or an administrator. End an existing run before loading another.

### Fabula character tracker

```text
/fab character create
/fab character view
/fab character edit-identity
/fab character edit-attributes
/fab hp remove value:5
/fab equipment mainhand name:Longsword
/fab equipment stats def:10 mdef:8 initiative:d8+2
/fab class add name:Guardian level:1
/fab spell add name:Example mp-cost:10 target:One enemy description:Record your spell rules here.
/fab character share
```

Each user has one character per server. Create opens a modal for name, maximum HP/MP/IP, and starting level; edit identity and attributes afterward. Attributes use d6/d8/d10/d12. Character levels range from 1–50, class levels from 1–6, with three accessory slots and up to five traits. These existing campaign limits are retained. Dice, status descriptions, and character defaults live in `src/cogs/fabula/utils/constants.js`; command limits are defined in the builders and handlers.

The main sheet provides resource buttons and section navigation. Quick resource modals accept `25` (set), `+10` (add), or `-5` (subtract). HP/MP/IP stay between zero and their maximum; lowering a maximum clamps the current value. FP, Zenit, and EXP remain nonnegative. Long equipment, class/skill, spell/ability, bond/identity, and status sections paginate.

Manage equipment, inventory quantities, classes and skills, spells and abilities, statuses, bonds, traits, and a quirk through the command groups below. Bond feelings are comma-separated, case-insensitive choices from Admiration, Inferiority, Affection, Hatred, Loyalty, and Mistrust. Campaign rules determine which combinations to use.

Sheet views respond privately to the requester. Other members can inspect a server character with `user:`; private replies are not private character storage. Use `/fab character share` to post publicly. Only the owner can change resources or edit/delete the character. Deletion has confirmation controls tied to that character, so an old confirmation cannot delete its replacement.

Fabula is a **persistent tracker**: equipment does not automatically recompute DEF/MDEF/initiative, EXP does not automatically level up, adding a spell does not cast it or spend MP, and status descriptions do not implement combat effects. Set totals and spend resources explicitly according to your campaign. The existing status descriptions are campaign configuration, not a claim of complete official rules automation. Previously posted sheets are snapshots; reopening or using a control fetches current data.

### Critter Workshop

The **Roleplay** tab lets the workspace owner create and edit NPCs and post as them in a chosen channel. Roleplay and Siege browse the same artwork folders. In the NPC editor, choose **Upload to** and an optional artwork subfolder. The filename supplies the default NPC name. Keep PNG, JPEG and WebP shared artwork at 8 MB or less. Siege uses images up to 1 MB.

- **Repository artwork** is stored in `assets/critter/artwork/`, ready to stage with `git add -- assets/critter/artwork/`. Review the staged files before committing. Everyone with access to the repository can see committed artwork.
- **Private artwork** is stored in `assets/critter/artwork-private/`, which Git ignores. Back up this folder separately. Existing NPC portraits in `assets/critter/npcs/` stay available under their original paths. To share a copy, upload the original file to **Repository artwork**.

In **WorldBuilder → Media library**, browse either available shared location and select the images to add to the current world. WorldBuilder keeps the world's own media record so existing links, credits, and tags remain usable. The private library is available to worlds already configured for local campaign images. To upload from WorldBuilder, select a location under **Upload to** before choosing files or dropping them. **This world only** uses the original WorldBuilder upload flow.

Use artwork subfolders such as `TouhouDND/Portraits` to organize files. **New folder** creates a subfolder in the location currently selected in the Aina image picker. The separate **Cast folder** field groups an NPC without moving its image. Roleplay supports eight loaded NPCs and remembers drafts, channels, temporary names and images, voice settings, and folder filters.

Run Aina's Discord bot, choose a default roleplay channel, create an NPC, load it into a slot, and press **Send**. An NPC can remember its own channel or use the default. Aina and the workspace owner must be able to post in the channel; Aina also needs **Manage Webhooks** in the destination channel (or the parent of a thread). The first post creates an Aina Roleplay webhook; its credential is stored only in `data/critter/roleplay-webhooks.json`. Do not share that file. Discord may rate-limit changes to the webhook avatar, especially when alternating between NPCs. A failed or uncertain post retains the draft; check Discord before sending again. Webhook messages are not Avrae commands issued by a player.

Type dialogue without the NPC name: each line is sent as `> NPC name: dialogue`. Enter sends from the focused box; Shift+Enter adds a line. To grant webhook permission for a thread, open its parent channel's **Edit Channel → Permissions**, add Aina or its role, and allow **View Channel** and **Manage Webhooks**. Confirm that channel overrides do not deny these permissions. Aina also needs permission to send in the thread. Only a server member with permission to manage the channel can change these settings.

The existing Critter implementation is outside this improvement pass. Open `http://127.0.0.1:4317` on the bot computer while Aina runs, or use `npm.cmd run critter` for the standalone local service. Discord commands are included in the reference below.

| Guide | Coverage |
| --- | --- |
| [Workshop workflow](docs/critter-workshop.md) | Library, editor, manual initiative, encounter controls |
| [Advanced workshop](docs/critter-workshop-advanced.md) | Additional editor and workspace tools |
| [Calculations](docs/workshop-calculations.md) | Shared calculations and editor controls |
| [Existing-tab connection](docs/critterdb-direct-editing.md) | CritterDB connector installation and reviewed direct saving |
| [Discord command previews](docs/discord-command-sender.md) | Post as Aina, saved shortcuts, destinations and delivery |
| [Combat traits](docs/avrae-combat-traits.md) | Trait configuration and conditional scope |
| [Ability follow-ups](docs/ability-followups.md) | After-roll tools, ending controls and local resources |
| [Critical ranges and players](docs/critical-ranges-and-players.md) | Critical controls and player targets |
| [Spellcasting and previews](docs/spellcasting-and-preview-controls.md) | Shared spell defaults, upcasting and Confirm/Reaction/Cancel |
| [Legacy encounter mirror](docs/avrae-encounter-mirror.md) | Background on the previous mirror workflow |

[AGENTS.md](AGENTS.md) requires the [single creature-authoring standard](docs/critterdb-avrae-authoring-standard.md) for creature work. A local file, a CritterDB account save, an Avrae bestiary update, and an existing encounter combatant are separate states. A posted preview or owner confirmation does not prove Avrae execution; local resource trackers require explicit updates. Follow the existing guides for those manual steps.

## Complete command reference

Generated from the same builders registered with Discord. `<option>` is required; `[option]` is optional. Use Discord's picker to enter channel/user/attachment options. Examples above are illustrative values, not commands executed by this README. Choices below show their underlying values; Discord may show friendlier labels.

<!-- commands:start -->

### ai

| Command | Description and choices |
| --- | --- |
| `/chat <message>` | Talk with Aina<br>message: max 4000 characters |
| `/endchat` | Clear your conversation memory in this channel |

### alarm

| Command | Description and choices |
| --- | --- |
| `/alarm set <time> <message> [frequency] [weekday] [channels] [members] [image]` | Set a new alarm<br>time: max 5 characters · message: max 1000 characters · frequency: once, daily, weekly · weekday: 1, 2, 3, 4, 5, 6, 7 · channels: max 500 characters · members: max 500 characters · image: max 255 characters |
| `/alarm list [page]` | List active alarms<br>page: min 1 |
| `/alarm edit <number> [time] [message] [frequency] [weekday] [channels] [members] [image]` | Edit an alarm you own (or Manage Server)<br>number: min 1 · time: max 5 characters · message: max 1000 characters · frequency: once, daily, weekly · weekday: 1, 2, 3, 4, 5, 6, 7 · channels: max 500 characters · members: max 500 characters · image: max 255 characters |
| `/alarm remove <number>` | Remove an alarm you own (or Manage Server)<br>number: min 1 |
| `/alarm images [page]` | List available alarm images<br>page: min 1 |
| `/time` | Show the current time in the configured alarm timezone |

### critter

| Command | Description and choices |
| --- | --- |
| `/critter open` | Open your local graphical workspace |
| `/critter edit <url>` | Open a CritterDB creature in your authenticated local editor |
| `/critter import <file>` | Import a CritterDB creature or bestiary JSON file |

### dungeon

| Command | Description and choices |
| --- | --- |
| `/dungeon create [size] [complexity] [floors] [difficulty] [name]` | Create a new dungeon<br>size: SMALL, MEDIUM, LARGE · complexity: EASY, NORMAL, HARD · floors: SMALL, MEDIUM, LARGE, EXTREME · difficulty: EASY, NORMAL, HARD, LUNATIC · name: max 100 characters |
| `/dungeon join` | Join the active dungeon |
| `/dungeon leave` | Leave the dungeon; leadership passes to the next player |
| `/dungeon status` | Show the current map and refresh movement controls |
| `/dungeon save` | Save progress (leader/admin only) |
| `/dungeon list [page]` | List saved dungeons<br>page: min 1 |
| `/dungeon load <id>` | Load a saved dungeon (saved leader/admin only)<br>id: max 150 characters |
| `/dungeon end` | End the dungeon (leader/admin only) |

### emoji

| Command | Description and choices |
| --- | --- |
| `/emoji stats [limit]` | Show top emoji usage<br>limit: min 1; max 25 |
| `/emoji sticker-stats [limit]` | Show top sticker usage<br>limit: min 1; max 25 |
| `/emoji info <emoji>` | Show a custom server emoji’s usage |
| `/emoji scan [days] [channel]` | Scan history without recounting known messages (Administrator)<br>days: min 1; max 365 |
| `/emoji clear` | Clear all server emoji and sticker statistics (Administrator) |
| `/emoji tracking` | Show usage totals and tracking scope |

### fabula

| Command | Description and choices |
| --- | --- |
| `/fab character create` | Create a character, then edit identity and attributes |
| `/fab character view [user]` | View a character sheet |
| `/fab character edit-identity` | Edit name, pronouns, image, theme, origin |
| `/fab character edit-attributes` | Edit MIG, DEX, INS, WLP dice |
| `/fab character delete` | Delete your character permanently |
| `/fab character share` | Post your character sheet publicly in this channel |
| `/fab hp set <value>` | Set current HP to an exact value<br>value: min 0 |
| `/fab hp add <value>` | Heal HP<br>value: min 1 |
| `/fab hp remove <value>` | Take damage<br>value: min 1 |
| `/fab hp max <value>` | Set maximum HP<br>value: min 1 |
| `/fab mp set <value>` | Set current MP<br>value: min 0 |
| `/fab mp add <value>` | Restore MP<br>value: min 1 |
| `/fab mp remove <value>` | Spend or lose MP<br>value: min 1 |
| `/fab mp max <value>` | Set maximum MP<br>value: min 1 |
| `/fab ip set <value>` | Set current IP<br>value: min 0 |
| `/fab ip add <value>` | Gain IP<br>value: min 1 |
| `/fab ip remove <value>` | Spend IP<br>value: min 1 |
| `/fab ip max <value>` | Set maximum IP<br>value: min 1 |
| `/fab fp set <value>` | Set Fabula Points to an exact value<br>value: min 0 |
| `/fab fp add <value>` | Gain Fabula Points<br>value: min 1 |
| `/fab fp remove <value>` | Spend Fabula Points<br>value: min 1 |
| `/fab zenit set <value>` | Set Zenit to an exact value<br>value: min 0 |
| `/fab zenit add <value>` | Gain Zenit<br>value: min 1 |
| `/fab zenit remove <value>` | Spend Zenit<br>value: min 1 |
| `/fab exp set <value>` | Set EXP to an exact value<br>value: min 0 |
| `/fab exp add <value>` | Add EXP<br>value: min 1 |
| `/fab level set <value>` | Set level to a specific value (1–50)<br>value: min 1; max 50 |
| `/fab level up` | Increment level by 1 |
| `/fab equipment view [user]` | View your equipment sheet |
| `/fab equipment mainhand <name> [accuracy] [damage] [damage-type] [category] [quality]` | Set main hand weapon<br>name: max 100 characters · accuracy: max 200 characters · damage: max 200 characters · damage-type: Physical, Air, Bolt, Dark, Earth, Fire, Ice, Light, Poison · category: Arcane, Bow, Brawling, Dagger, Firearm, Flail, Heavy, Spear, Sword, Thrown · quality: max 1000 characters |
| `/fab equipment offhand <name> [accuracy] [damage] [damage-type] [category] [quality]` | Set off hand weapon or item<br>name: max 100 characters · accuracy: max 200 characters · damage: max 200 characters · damage-type: Physical, Air, Bolt, Dark, Earth, Fire, Ice, Light, Poison · category: Arcane, Bow, Brawling, Dagger, Firearm, Flail, Heavy, Spear, Sword, Thrown · quality: max 1000 characters |
| `/fab equipment armor <name> [def] [mdef] [initiative] [quality]` | Set armor<br>name: max 100 characters · def: min 0 · mdef: min 0 · quality: max 1000 characters |
| `/fab equipment shield <name> [def] [mdef] [quality]` | Set shield<br>name: max 100 characters · def: min 0 · mdef: min 0 · quality: max 1000 characters |
| `/fab equipment accessory-add <slot> <name> [effect]` | Set an accessory (slots 1–3)<br>slot: min 1; max 3 · name: max 100 characters · effect: max 1000 characters |
| `/fab equipment accessory-remove <slot>` | Remove an accessory by slot<br>slot: min 1; max 3 |
| `/fab equipment item-add <name> [qty] [desc]` | Add an item to your inventory<br>name: max 100 characters · qty: min 1 · desc: max 1000 characters |
| `/fab equipment item-remove <name> [qty]` | Remove an item from inventory<br>name: max 100 characters · qty: min 1 |
| `/fab equipment clear <slot>` | Unequip a gear slot<br>slot: mainhand, offhand, armor, shield |
| `/fab equipment stats [def] [mdef] [initiative]` | Update DEF, MDEF, and Initiative totals<br>def: min 0 · mdef: min 0 · initiative: max 200 characters |
| `/fab class add <name> [level]` | Add a class<br>name: max 100 characters · level: min 1; max 6 |
| `/fab class edit <name> <level>` | Update a class level<br>name: max 100 characters · level: min 1; max 6 |
| `/fab class remove <name>` | Remove a class and all its skills<br>name: max 100 characters |
| `/fab class view [user]` | View all classes and skills |
| `/fab skill add <class> <name> [description]` | Add a skill to a class<br>class: max 100 characters · name: max 100 characters · description: max 1000 characters |
| `/fab skill edit <class> <name> <description>` | Edit a skill description<br>class: max 100 characters · name: max 100 characters · description: max 1000 characters |
| `/fab skill remove <class> <name>` | Remove a skill from a class<br>class: max 100 characters · name: max 100 characters |
| `/fab spell add <name> [mp-cost] [target] [description]` | Add a spell to your list<br>name: max 100 characters · mp-cost: min 0 · target: max 200 characters · description: max 1000 characters |
| `/fab spell edit <name> [mp-cost] [target] [description]` | Edit a spell<br>name: max 100 characters · mp-cost: min 0 · target: max 200 characters · description: max 1000 characters |
| `/fab spell remove <name>` | Remove a spell<br>name: max 100 characters |
| `/fab spell list [user]` | View all spells and abilities |
| `/fab ability add <name> [description]` | Add an ability<br>name: max 100 characters · description: max 1000 characters |
| `/fab ability edit <name> <description>` | Edit an ability<br>name: max 100 characters · description: max 1000 characters |
| `/fab ability remove <name>` | Remove an ability<br>name: max 100 characters |
| `/fab status add <effect>` | Apply a status effect<br>effect: Slow, Dazed, Weak, Shaken, Enraged, Poisoned, Burning, Frozen, Confused, Provoked, Unconscious; max 1000 characters |
| `/fab status remove <effect>` | Remove a status effect<br>effect: Slow, Dazed, Weak, Shaken, Enraged, Poisoned, Burning, Frozen, Confused, Provoked, Unconscious; max 1000 characters |
| `/fab status clear` | Remove ALL active status effects |
| `/fab status view [user]` | View active status effects |
| `/fab bond add <name> <feelings>` | Add a bond<br>name: max 100 characters · feelings: max 200 characters |
| `/fab bond edit <name> <feelings>` | Update a bond's feelings<br>name: max 100 characters · feelings: max 200 characters |
| `/fab bond remove <name>` | Remove a bond<br>name: max 100 characters |
| `/fab bond view [user]` | View all bonds and identity info |
| `/fab identity trait-add <text>` | Add a character trait<br>text: max 100 characters |
| `/fab identity trait-remove <number>` | Remove a trait by number<br>number: min 1 |
| `/fab identity quirk <text>` | Set your character quirk<br>text: max 150 characters |

### transcript

| Command | Description and choices |
| --- | --- |
| `/transcript [channel] [text_only] [speakers] [dates] [attachments] [embed_text] [images] [from_date] [through_date]` | Save a channel or thread transcript locally<br>from_date: max 10 characters · through_date: max 10 characters |

### tts

| Command | Description and choices |
| --- | --- |
| `/ttv join [channel]` | Join your voice channel |
| `/ttv leave` | Disconnect and cancel queued speech |
| `/ttv say <text>` | Queue text to speak aloud<br>text: max 2000 characters |
| `/ttv stop` | Stop current speech and clear the queue |
| `/ttv status` | Show the current voice channel and speech queue |

### utility

| Command | Description and choices |
| --- | --- |
| `/help [category] [page]` | Browse Aina’s available commands<br>category: alarms, dungeon, emoji, ai, ttv, fabula, utility, critter, transcript · page: min 1 |
| `/ping` | Check Aina’s latency and uptime |

<!-- commands:end -->

## Data, privacy, and backups

| Location | Contents and lifetime |
| --- | --- |
| `.env` | Secrets and environment configuration; ignored by Git |
| `data/alarms/<guild>.json` | Alarms, recurrence times, delivery receipts and errors |
| `data/emoji/<guild>.json` | Emoji/sticker totals, message IDs, reaction-user IDs, deduplication records |
| `data/dungeons/saves/<save>.json` | Manual dungeon saves; active runs are in RAM |
| `data/fabula/<guild>/<user>.json` | Persistent character sheets |
| `data/users/registry.json` | IDs, names, first/last seen, observed server IDs, command/chat request counters |
| `data/critter/` | Existing workshop data; retain its backups and exported files |
| `data/transcripts/` | Locally saved private channel transcripts; one complete UTF-8 text file per successful export |
| `history/{commands,errors,sessions}/YYYY-MM-DD.jsonl` | New append-only logs with UTC dates/times |
| `history/.../*.json` | Legacy logs retained without conversion |
| `assets/images/alarms/` | Host-installed reminder images |
| `assets/audio/aina-tts-*/` | Temporary per-request speech audio, normally removed automatically |
| RAM | AI conversation history, active dungeon runs, voice queues, transient locks/caches |

JSON updates use temporary files and replacement to avoid exposing a half-written document. Malformed existing data is reported and preserved instead of silently reset. Telemetry caches batch writes for roughly one second and flush during graceful shutdown; a forced termination can lose that small pending window. Atomic replacement is not a backup and does not coordinate multiple Aina processes.

Commands are logged with command/group/subcommand and actor/server metadata, not their option values. User records do not contain conversation transcripts. AI requests send the current conversation and personality prompt to Groq; voice requests send text to the speech provider. Alarm messages and character notes are stored locally. Error logs can contain diagnostic context; the logger redacts configured bot/API keys. Discord itself retains posted messages independently of Aina's memory.

Stop Aina before copying or restoring `data/`, `config/`, `.env`, alarm images, and any workshop exports. Keep backups private. Restore a damaged file from a known-good backup, then restart; do not overwrite it with an empty file simply to silence an error. Emoji deduplication records and log files grow with use; there is no automatic retention purge. After an abnormal termination, inspect and remove abandoned `aina-tts-*` temporary request directories only while the bot is stopped.

## Operation and maintenance

- `npm.cmd start`: start the Discord bot and existing local workshop.
- `npm.cmd run dev`: restart on source changes with nodemon. Save active dungeons before a restart.
- Ctrl+C / SIGTERM: stop scheduling, drain active alarm work, cancel voice, disconnect Discord, flush telemetry, close the workshop. Shutdown has a 10-second outer deadline; forced termination has the persistence limitations above.
- Use a process supervisor or OS service for unattended hosting. Start in this repository, retain one process, and configure a restart delay rather than a rapid loop on configuration failures.
- Back up data before updates, run `npm.cmd ci`, `npm.cmd run doctor`, and tests, then restart.
- Leave `REGISTER_COMMANDS=true` to verify and synchronize commands on startup. Unchanged definitions are retained without rewriting them. To publish independently of startup, use `npm.cmd run commands:sync`. The primary scope and any `COMMAND_GUILD_IDS` servers are checked; publication is separate from local validation.
- All non-critter tests and diagnostics run without a Discord login. A live release still needs an authorized server check of command registration, permissions, alarms/DMs, AI, and speech.

## Development and verification

```powershell
npm.cmd run test:core
npm.cmd test
npm.cmd run docs:commands
npm.cmd run docs:check
npm.cmd run doctor
```

`test:core` covers AI/memory, runtime, storage, alarms, dungeon, emoji, Fabula, and TTS. `npm test` also runs the existing Critter regression suite. Tests use temporary stores and mocked providers; passing them is not a successful live Discord, Groq, speech, or CritterDB test. Existing browser and Avrae checks remain available under their original `test:critter:*` / `test:avrae:expressions` scripts; consult the feature guides for prerequisites and whether a script uses a browser or remote service.

`docs:commands` refreshes the marked tables in this README from every cog's command builder; `docs:check` fails if they drift. `/help` builds its pages from the running client's loaded commands, including Fabula and Critter.

```text
index.js                    Startup, registration, Discord client, shutdown
config/                     Settings, dungeon constants
src/cogs/<feature>/index.js  Slash builders, command handlers, extra events
src/cogs/fabula/             Fabula handlers, validation, persistence, sheets
src/events/                 Shared ready/message/interaction/error handlers
src/handlers/               Cog/event loading and history logging
src/utils/                  Feature managers, storage, AI memory, command catalog
src/critter/                Existing workshop implementation
extensions/aina-critterdb/   Existing-tab connector
scripts/                    Local diagnostics, command docs, existing verification
test/                       Offline regression tests
docs/                       Existing workshop guides and authoring standard
```

A cog exports `{ commands: [{ data, execute }], events? }`. The loader validates and stages all definitions before installing them, rejects duplicate names, and catches asynchronous event errors. Guild-only commands also check context at runtime. Keep slow work behind an interaction acknowledgement, preserve data on validation failure, and test state changes and races rather than only JSON syntax.

## Troubleshooting

In **Siege → Manage Squads**, edit the squad and open **Heal & restore**. **HP change** accepts positive healing or negative damage (for example, `-125` removes 125 HP). **Healing uses** accepts positive amounts to restore spent uses or negative amounts to spend available uses. Both clamp at their limits; healing does not revive a defeated squad. Finish or cancel an active battle before adjusting its squads. **Reset** explicitly restores full HP and healing uses.

| Symptom | Check |
| --- | --- |
| Startup rejects configuration | Run doctor. Set real token/application IDs; explicit guild scope needs GUILD_ID. Confirm timezone and true/false registration values. |
| Commands missing or “This command is outdated” | Run `npm.cmd run commands:sync` and check its verified scope. For an immediate server copy, set COMMAND_GUILD_IDS to your server ID and sync again. Refresh Discord with Ctrl+R and select a fresh command suggestion. Check applications.commands scope and channel command permissions if it remains hidden. Restart Aina to load changed handlers. |
| Duplicate commands | Review global and guild registrations; changing scope does not remove the other scope. |
| Disallowed intents / no message tracking | Enable the two requested privileged intents in the Developer Portal; check Message Content access and channel visibility. |
| Chat unavailable | Check GROQ_API_KEY, accessible GROQ_MODEL, rate limits, and provider timeout messages. Failed requests do not erase prior conversation. |
| Alarm did not reach a recipient | Check /alarm list delivery errors, timezone, destination permissions, DM privacy, and whether Aina was online. |
| Emoji scan seems incomplete | Inspect skipped-channel/reaction counts and scan limits. Narrow the channel/date range; uncached archived threads are not automatically enumerated. |
| Voice joins but produces no sound | Run doctor; check FFmpeg, Opus support, Connect/Speak, server mute, outbound voice connectivity, and the speech provider. Use /ttv status and /ttv stop. |
| Native Opus installation fails | It is optional. The included opusscript encoder can be used; do not treat an optional build failure as loss of all bot features. |
| Dungeon buttons are stale | Use /dungeon status and the newest map. Check membership, the five-minute inactivity timeout, and whether the run was replaced. |
| Fabula totals do not change with equipment/status | These are manual tracker values. Use equipment stats/resource commands to apply the campaign's result. |
| Data file cannot be read | Preserve it, stop Aina, restore a backup, and inspect the error. Corrupt files are not silently discarded. |
| Local workshop works but bot is offline | The existing offline fallback keeps the editor open. Read the startup error and correct Discord setup before restarting. |


## WorldBuilder in Aina

Run `npm start` from the Aina project folder and open the usual Aina address (`http://127.0.0.1:4317/#worldbuilder`). WorldBuilder fills the window with its original design. Its top-left hamburger opens Aina tools. Outside WorldBuilder, the normal Aina tab bar returns with WorldBuilder as its last tab. Combat, Initiative, Siege, Library, Commands and Roleplay each use the full workspace; returning to WorldBuilder preserves the open editor. Aina starts the Python backend and stops it when Aina exits. No WorldBuilder launcher or second terminal is needed, and it does not open a browser window. The source lives in `src/critter/WorldBuilder/WorldBuilder/`.

The transferred database was verified and restored to `src/critter/WorldBuilder/WorldBuilder/data-recovered-transfer/`; the empty `data/` database was left intact. The local `aina-data.json` selects that recovered directory. Existing account **a** can log in with its original WorldBuilder password: unique saved display names are accepted as login aliases, preserving the original internal account ID, username and password hash. `owner` remains a valid login for that original account. **Create account** adds a named local account with a separate first world. **Log out** is in the account menu at the top right. Login and Create account are always separate accessible choices; usernames are editable. Passwords are hashed with Django's password storage; sessions and CSRF protection remain enabled. Creating a new account does not transfer ownership of existing worlds. Complete installation backups are available only to the installation owner; other accounts can export their own worlds.

Aina keeps the WorldBuilder frame mounted when switching tabs, preserving unsaved editor state. It uses WorldBuilder's stable local port (default `8777`) so local sessions and draft recovery survive restarts. To change a conflicting port, set `WORLDBUILDER_PORT` in Aina's `.env` and restart. Close an older separately launched WorldBuilder before the first integrated start. Embedding is allowed only from Aina's exact local origin; both servers bind to loopback.

Python is required for WorldBuilder. On a missing environment Aina creates its local virtual environment and installs its locked Python dependencies. A missing frontend build is installed and built automatically (internet access is required for missing dependencies). The current installation has been repaired and rebuilt. The original transferred npm lock is retained as `package-lock.before-aina.json`.

Local verification: `node scripts/check-worldbuilder-integration.js` launches an isolated database, backend and headless browser to check managed startup/shutdown, setup, named accounts, login/logout, session persistence, account isolation and an unsaved editor across tab changes. It does not contact Discord or change the existing campaign database. Full WorldBuilder backups include accounts and media; Aina's JSON workspace backup does not include the WorldBuilder database.

On Windows, restored WorldBuilder folders inherit the installation folder permissions. This lets the normal Windows user create/read the local `.secret-key` and save to the recovered database. The managed parent watcher uses unbuffered OS pipe reads so a startup error exits without a Python buffered-stdin shutdown crash.
