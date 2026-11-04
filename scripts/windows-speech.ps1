param(
    [ValidateSet('voices', 'speak')][string]$Mode = 'voices',
    [string]$InputFile,
    [string]$OutputFile
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    if ($Mode -eq 'voices') {
        $voices = @($synthesizer.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
            @{ id = $_.VoiceInfo.Name; name = ('{0} - {1}, {2}' -f $_.VoiceInfo.Name, $_.VoiceInfo.Culture.Name, $_.VoiceInfo.Gender) }
        })
        ConvertTo-Json -InputObject $voices -Compress
    } else {
        $request = Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($request.voice -and $request.voice -ne 'default') { $synthesizer.SelectVoice([string]$request.voice) }
        $synthesizer.SetOutputToWaveFile($OutputFile)
        $synthesizer.Speak([string]$request.text)
    }
} finally { $synthesizer.Dispose() }
