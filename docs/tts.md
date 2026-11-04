# Aina speech providers and setup

Plain Message supports 14 provider adapters. The selector starts on **Groq / Autumn**, and TTS starts unchecked. Local engines have no API quota; hosted free plans have limits and eligibility rules. Using a paid project or exceeding a billing-enabled allowance can cost money. Aina never creates accounts, upgrades plans, changes billing, or automatically switches to another provider.

## Use the selector

1. Restart Aina after upgrading or editing `.env`, then press **Ctrl+F5** in the workshop.
2. Join a Discord voice channel. Choose your message's text channel in the same server.
3. Under **Commands → Plain message**, enable TTS. Select a provider and a voice, then your voice channel.
4. Read the provider's setup/status text. **Reload voices** refreshes discovery after installing models or changing account voices. Voice selectors support the workshop's searchable dropdown.
5. Send your message. Aina joins before posting and starts speech only after Discord confirms the text post.

The text remains unchanged; leading Discord `>` quote markers are omitted from speech. Voice settings belong to each queued message, so changing the selector cannot change earlier narration. Recent posts records the chosen provider/voice and separate delivery/speech outcomes. **Clear** discards your current field; confirmed text delivery clears it automatically. Failed/uncertain text delivery keeps the draft, and a newer draft is protected from an older send's completion.

**Stop speech** clears the server's active and queued narration. **Leave voice** also disconnects. These controls share the queue with `/ttv`. Voice controls require membership in the destination channel or Move Members; moving Aina away from another channel requires Move Members. Aina needs View Channel, Connect and Speak. Text-only sending remains available when a speech provider is unconfigured.

## Free options supported in Aina

Limits below were checked against the linked provider pages on **28 October 2026**. Provider dashboards determine the current quota and account eligibility.

| Provider ID | What is free | Setup | Voice source |
| --- | --- | --- | --- |
| `groq` | [Free plan with rate/usage limits](https://console.groq.com/docs/rate-limits) | Separate speech key | Six English Orpheus voices; Autumn default |
| `edge` | Online Read Aloud access with no personal key, through [MsEdgeTTS](https://github.com/Migushthe2nd/MsEdgeTTS) | Internet access | Complete live multilingual voice list, rather than nine curated voices |
| `windows` | [Installed Windows SAPI speech](https://learn.microsoft.com/dotnet/api/system.speech.synthesis.speechsynthesizer), offline | Windows; add speech voices in Windows settings if desired | Every enabled voice returned by System.Speech |
| `piper` | [Local open-source inference](https://github.com/OHF-Voice/piper1-gpl); voice-model licenses vary | Python, downloaded models, local HTTP server | All downloaded models and their individual speakers |
| `kokoro` | [Local Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) | Local server, commonly Docker | All voices exposed by that server |
| `espeak` | [Local eSpeak NG](https://github.com/espeak-ng/espeak-ng), offline | Install eSpeak NG | Installed engine's complete voice list |
| `local` | [LocalAI / compatible local engines](https://localai.io/docs/features/text-to-audio/) | Running compatible server and model | IDs you configure for the chosen backend |
| `gemini` | [Gemini Flash TTS free tier](https://ai.google.dev/gemini-api/docs/pricing), subject to quota | Google AI Studio API key | 30 prebuilt voices; Charon default |
| `elevenlabs` | [10,000 monthly free credits](https://elevenlabs.io/pricing); API/voice eligibility and attribution restrictions apply | ElevenLabs free account/key | Account voice pages, excluding professional voices not marked free-eligible |
| `cartesia` | [20,000 monthly free credits](https://www.cartesia.ai/pricing); free-plan terms apply | Cartesia free account/key | Paginated API voice list |
| `azure` | [F0 free speech allowance](https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/), currently 0.5 million neural characters/month | Azure Speech resource explicitly using **F0**, key and region | Resource-region voice list; F0/model restrictions still apply |
| `google` | [Monthly free allowances](https://cloud.google.com/text-to-speech/pricing), varying by voice class | Billing-enabled Google Cloud project/key; overages can charge | Google Cloud voice list, including classes with different allowances |
| `ibm` | [Lite: 10,000 characters/month](https://www.ibm.com/products/cloud/free) | Watson Text to Speech **Lite** instance, key and service URL | Instance's available voices |
| `cloudflare` | [Workers Free: 10,000 Neurons/day](https://developers.cloudflare.com/workers-ai/platform/pricing/) | Cloudflare account ID and Workers AI API token | Aura 1, Aura 2 English/Spanish, and MeloTTS choices |

For a male voice, audition Groq's Austin/Daniel/Troy, Edge's Guy/Christopher/Ryan, Windows' David if installed, Piper's Ryan, or Kokoro's `am_michael`. Voice names alone do not guarantee a particular depth or acting style.

## No-key options

### Edge: online, immediate

Select **Microsoft Edge** in Plain Message, wait for voice discovery, select any returned voice and send. No speech API key or model download is needed. This uses a community client for Microsoft's online Read Aloud service; its availability is independent of Aina. Aina uses maintained connection handling and bounded synthesis timeouts.

To make Edge the `/ttv` default:

```dotenv
TTS_PROVIDER=edge
TTS_VOICE=en-US-GuyNeural
```

### Windows: offline, immediate

Select **Windows installed voices**. Aina lists enabled SAPI voices on the computer running the bot, not voices installed only on your phone. Common choices include David and Zira; availability depends on your Windows installation. Windows Narrator's separate Natural Voices do not necessarily appear in System.Speech.

For `/ttv`, set `TTS_PROVIDER=windows`; optionally set `WINDOWS_TTS_VOICE=Microsoft David Desktop`. An empty voice setting uses the OS default. The helper writes WAV files without playing sound on the host computer. It launches hidden PowerShell with a process-local execution-policy setting and passes narration through a JSON file; it changes no system policy.

### Piper: offline after model download

Python 3 is required. From this repository:

```powershell
npm.cmd run tts:setup -- piper
npm.cmd run tts:setup -- piper en_US-ryan-high
npm.cmd run tts:serve -- piper
```

Setup creates `.tts/piper` as an isolated Python environment and stores models in `.tts/piper-voices`. It leaves system Python untouched. Keep the serve command running in another terminal while Aina is running. The server binds to **127.0.0.1:5000**. In Plain Message select Piper and press Reload voices. Both downloaded models are available; multi-speaker models appear as separate choices for every speaker.

Use the same setup command with another model ID from [Piper's model catalog](https://huggingface.co/rhasspy/piper-voices). Run `tts:serve -- piper MODEL_ID` to change the server's default; other downloaded models remain selectable. The integration calls the [official HTTP API](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_HTTP.md). It does not download additional models merely because you open the selector.

```dotenv
PIPER_TTS_URL=http://127.0.0.1:5000
PIPER_TTS_VOICE=en_US-lessac-medium
```

### Kokoro: local neural speech

Install and start Docker Desktop, then:

```powershell
npm.cmd run tts:setup -- kokoro
npm.cmd run tts:serve -- kokoro
```

These use the upstream CPU image; a GPU is not required. The serve command exposes the API only on **127.0.0.1:8880**. Keep it running. Aina discovers the server's full catalog from `/v1/audio/voices`. For another installation, set `KOKORO_TTS_URL` to its `/v1` base URL. The image download is larger than a Piper voice. These commands require Docker to be installed; Aina does not install Docker or alter virtualization settings.

```dotenv
KOKORO_TTS_URL=http://127.0.0.1:8880/v1
KOKORO_TTS_VOICE=af_heart
```

### eSpeak NG: small offline engine

Install the Windows package from the [upstream releases](https://github.com/espeak-ng/espeak-ng/releases), then set its executable path if it is not on PATH:

```dotenv
ESPEAK_TTS_PATH=C:\Program Files\eSpeak NG\espeak-ng.exe
ESPEAK_TTS_VOICE=en-us
```

Restart Aina and select eSpeak NG. It lists installed languages/voices using the engine's CLI, and generates WAV through literal subprocess arguments. No shell command is built from message text.

### Other local engines through LocalAI / compatible servers

The compatible adapter posts to `/v1/audio/speech`. It can connect additional engines served by [LocalAI](https://localai.io/docs/features/text-to-audio/), including its supported Piper, Kokoro, Coqui, Chatterbox, Fish Speech, Qwen and audio.cpp backends. Install/configure the model on that server first. Model licenses, RAM/GPU requirements, language support and any required reference voices depend on the selected model. Cloning-only models need a reference voice configured on the server; Aina does not invent one.

```dotenv
LOCAL_TTS_URL=http://127.0.0.1:8080/v1
LOCAL_TTS_MODEL=your-installed-model-name
LOCAL_TTS_VOICE=narrator
LOCAL_TTS_VOICES=narrator,dragon,wizard
LOCAL_TTS_API_KEY=
```

Use actual speaker IDs or backend voice references. Aina shows every comma-separated configured ID. This endpoint family has no universal voice-list API, so Aina does not guess a speaker catalog. A locally configured reference path or `localai://voice-profiles/...` ID can be used where that backend supports it. The model/server must accept OpenAI-compatible speech requests and return WAV, MP3 or Ogg.

## Hosted free plans

Create only the accounts you want. Put keys in `.env`, never in messages or the workshop. Empty keys leave the corresponding provider visible with setup guidance. Restart after changing environment settings. Aina never substitutes the AI chat key.

### Groq

Create a Groq project key with access to Orpheus. Choose the free plan if that is your intended usage. Use:

```dotenv
GROQ_TTS_API_KEY=
GROQ_TTS_MODEL=canopylabs/orpheus-v1-english
GROQ_TTS_VOICE=autumn
```

The six voices are Autumn, Diana, Hannah, Austin, Daniel and Troy. [Orpheus](https://console.groq.com/docs/text-to-speech/orpheus) accepts at most 200 characters per request and returns WAV; Aina segments longer narration while preserving the chosen voice and queue order.

### Google AI Studio / Gemini

Create a key in [Google AI Studio](https://aistudio.google.com/api-keys) for a project eligible for the free API tier:

```dotenv
GEMINI_TTS_API_KEY=
GEMINI_TTS_MODEL=gemini-3.8-flash-lite-tts
GEMINI_TTS_VOICE=Charon
```

The default uses the current [Interactions speech API](https://ai.google.dev/gemini-api/docs/speech-generation) and its WAV output. Gemini 3.8 Flash is also supported. Legacy 3.1/2.5 TTS model IDs use `generateContent`, including proper PCM-to-WAV conversion; access and availability depend on Google. The selector includes the 30 prebuilt personas. Extended/custom voice creation is not performed by Aina. Check the project's free quotas and Google's free-tier data terms.

### ElevenLabs

Create an [ElevenLabs key](https://elevenlabs.io/app/settings/api-keys) permitted to read voices and synthesize speech. Free accounts may use a narrower voice set than the website, and professional Voice Library voices can be unavailable through the free API.

```dotenv
ELEVENLABS_TTS_API_KEY=
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_TTS_VOICE=
```

Leaving the default voice empty lets the selector choose an available returned voice. Aina follows all voice pages and excludes professional voices not marked free-eligible. It cannot guarantee every returned voice/model is permitted by every account; the provider enforces eligibility. Follow the free plan's attribution and non-commercial conditions when applicable. See [API introduction](https://elevenlabs.io/docs/overview/intro).

### Cartesia

Create a free account and key at [Cartesia](https://play.cartesia.ai/keys):

```dotenv
CARTESIA_TTS_API_KEY=
CARTESIA_TTS_MODEL=sonic-3.6
CARTESIA_TTS_VERSION=2026-08-14
CARTESIA_TTS_VOICE=
```

Aina retrieves every voice page and sends the selected ID to the [bytes endpoint](https://docs.cartesia.ai/api-reference/tts/bytes). Empty default voice selects the first available returned voice. The free plan currently grants 20K monthly credits; commercial-use rights differ from paid plans.

### Azure Speech

Create an Azure Speech resource using the **F0** pricing tier, then copy its key and region:

```dotenv
AZURE_TTS_API_KEY=
AZURE_TTS_REGION=eastus
AZURE_TTS_VOICE=en-US-GuyNeural
```

The region must match the resource. Aina uses [Azure's REST API](https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech), including escaped SSML, and lists the region's voices. Not all voice classes or models are available under F0. Aina cannot determine your resource's billing tier from the key; do not assume an S0 resource is free.

### Google Cloud Text-to-Speech

Enable Cloud Text-to-Speech in a Google Cloud project, enable billing as required by Google, and create an API key restricted to this API:

```dotenv
GOOGLE_TTS_API_KEY=
GOOGLE_TTS_VOICE=en-US-Standard-B
```

This is separate from Gemini/AI Studio. Standard, WaveNet/Neural2 and higher voice classes have different free allowances and prices. Aina lists the API voices but does not promise a zero bill for a billing-enabled project. Check [current pricing](https://cloud.google.com/text-to-speech/pricing), select an appropriate class, and configure project quotas. Budget alerts alone are not a spending cap.

### IBM Watson

Create a **Lite** Watson Text to Speech instance in IBM Cloud. Copy its API key and full instance service URL:

```dotenv
IBM_TTS_API_KEY=
IBM_TTS_URL=https://api.us-south.text-to-speech.watson.cloud.ibm.com/instances/YOUR_INSTANCE_ID
IBM_TTS_VOICE=en-US_MichaelV3Voice
```

Use the URL shown in the credentials page rather than the example ID. The [Lite allowance](https://www.ibm.com/products/cloud/free) is 10K characters/month. Voice discovery uses the instance's `/v1/voices` endpoint; synthesis requests WAV.

### Cloudflare Workers AI

Create a Cloudflare account on Workers Free. Copy its account ID and create a token allowed to invoke Workers AI, following the [REST setup guide](https://developers.cloudflare.com/workers-ai/get-started/rest-api/):

```dotenv
CLOUDFLARE_TTS_API_TOKEN=
CLOUDFLARE_TTS_ACCOUNT_ID=
CLOUDFLARE_TTS_VOICE=aura-2-en/apollo
```

The selector includes the [Aura 2 English speakers](https://developers.cloudflare.com/workers-ai/models/aura-2-en/), [Aura 2 Spanish speakers](https://developers.cloudflare.com/workers-ai/models/aura-2-es/), [Aura 1 speakers](https://developers.cloudflare.com/workers-ai/models/aura-1/), and [MeloTTS language choices](https://developers.cloudflare.com/workers-ai/models/melotts/). The selected voice includes the model family, so you can switch models without editing `.env`. Workers Free stops when its daily allocation is exhausted; paid Workers plans can charge beyond the allowance. No direct Deepgram account is needed for Cloudflare-hosted Aura.

## Temporary credits and web-only free tools

[Amazon Polly](https://aws.amazon.com/polly/pricing/) and [Deepgram](https://deepgram.com/pricing) offer new-account/trial credits rather than the ongoing free API allowance used for the hosted providers above. Murf and PlayHT/PlayAI were not verified as ongoing free API options in this audit. [Unreal Speech](https://unrealspeech.com/) advertises a free allowance but its public page mixes one-time and monthly-reset descriptions; verify the account's actual allowance and current API version before treating it as recurring-free.

Other commonly suggested services need qualification:

| Service | Current finding |
| --- | --- |
| Hugging Face hosted inference | The [current pricing page](https://huggingface.co/docs/inference-providers/pricing) lists no included Inference Provider credits for Free users. Free model downloads for local inference are separate. Older claims of $0.10 monthly credits are stale. |
| LMNT | Its [official site](https://www.lmnt.com/) states that the speech-generation service has shut down. |
| Smallest AI | Its [account documentation](https://docs.smallest.ai/voice-agents/platform/account/subscription-plans) describes starting credits followed by pay-as-you-go; this is not an ongoing free allowance. |
| Inworld | [On-Demand pricing](https://inworld.ai/pricing) includes evaluation speech and usage rates; a recurring unlimited free speech entitlement was not established. |
| TTSMaker | [The free website](https://ttsmaker.com/) and [Pro API key platform](https://pro.ttsmaker.com/api-platform/api-key-list) are different access paths. A public demo token is not a production entitlement. |
| Pollinations | [The API](https://gen.pollinations.ai/) requires a key; [free Quest Pollen](https://pollinations.ai/) is earned credit rather than an unlimited quota. Its compatible speech endpoint can be used through Aina's compatible adapter if you have credits and a valid key. |

For a Pollinations account with earned Pollen, the compatible adapter can use `LOCAL_TTS_URL=https://gen.pollinations.ai/v1`, your actual audio model ID in `LOCAL_TTS_MODEL`, your secret key in `LOCAL_TTS_API_KEY`, and that model's actual voice IDs in `LOCAL_TTS_VOICES`. Credit eligibility and costs are controlled by Pollinations; Aina does not label it an unlimited free service.

Browser SpeechSynthesis, free website previews, and websites requiring a CAPTCHA do not automatically provide a supported API or an audio file Aina can play in Discord. Aina does not scrape account pages, bypass limits, or promise that every website advertising “free TTS” is an API provider. The compatible local adapter is the extension path for additional self-hosted models.

## Diagnosis and verification

```powershell
# Read available voices; no Discord connection or speech generation:
npm.cmd run tts:voices -- edge
npm.cmd run tts:voices -- windows
npm.cmd run tts:voices -- piper
# Synthesize a short sample, decode it for Discord, and save it under .tts/checks:
npm.cmd run tts:check -- windows "Microsoft David Desktop"
npm.cmd run tts:check -- piper en_US-ryan-high
npm.cmd run tts:check -- groq autumn
# Temporary Piper server + discovery/synthesis/decoder test; server is stopped afterward:
npm.cmd run test:tts:local
```

`tts:check` consumes the selected hosted provider's quota if you choose a hosted service. It never joins Discord or plays through host speakers automatically. Open the printed audio path to audition it locally. `/ttv status` reports the `.env` default provider; Plain Message may independently select another provider.

Voice discovery is cached for 15 minutes, with a short 30-second failure cache. Reload voices bypasses the cache. Aina fetches only the selected dynamic provider and shares concurrent discovery requests. Hosted pagination is capped at 100 pages; exceeding it reports failure rather than silently claiming the list is complete. Piper lists downloaded models rather than initiating model downloads from the selector.

Speech requests have cancellation, deadlines and bounded responses; no failed synthesis is automatically retried. Other providers are segmented into at most 1000-character requests, with Groq capped at 200, to bound playback and request size. Text, provider and voice stay together throughout all segments. Temporary audio is removed after completion/failure/cancellation. A restart does not replay speech.

Offline tests use mocked provider responses and temporary files. Windows, Edge and Piper also have separate real synthesis checks; these are not a live Discord playback test. Services requiring new keys/accounts cannot be live-verified until those credentials exist. Docker/Kokoro and eSpeak require their local installations. A configured label alone is not proof of working credentials, quota, a running model server, or live voice playback.
