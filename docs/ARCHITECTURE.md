# Resonance HiFi — Arquitetura & Fluxos

Diagramas do sistema, derivados do código (`server/`, `install.sh`, `src/`).
Renderizam diretamente no GitHub (Mermaid).

---

## 1. Fluxo de Som (cadeia de áudio)

Todas as fontes convergem para o PipeWire, são processadas pelo CamillaDSP e
saem para o DAC — **exceto** ficheiros DSD em Pure Direct, que fazem *bypass*
direto para o DAC (DoP).

```mermaid
flowchart TD
    subgraph SRC["Fontes"]
        SPOT["Spotify Connect<br/>raspotify / librespot"]
        AIR["AirPlay 2<br/>shairport-sync"]
        UPNP["UPnP / DLNA<br/>upmpdcli"]
        BT["Bluetooth A2DP<br/>bluealsa"]
        MPD["MPD<br/>Local · Web Radio · Tidal · Qobuz"]
    end

    SPOT --> PW
    AIR --> PW
    BT --> PW
    UPNP --> MPD
    MPD -->|"saída PCM (predefinição)"| PW

    subgraph PCM["Cadeia PCM (predefinição)"]
        PW["PipeWire — sink virtual 'ResonanceInput'<br/>S32 · clock.allowed-rates = rate-following"]
        LB["ALSA snd-aloop<br/>hw:Loopback,0,0"]
        DS["loop_dsnoop (dsnoop)<br/>hw:Loopback,1,0 — S32, rate-agnostic"]
        CAM["CamillaDSP — captura loop_dsnoop<br/>A: room correction · B: EQ 5 bandas<br/>C: ajustes sala · D: crossover<br/>E: preamp (auto-headroom) · phase · balance<br/>SetVolume"]
        PW --> LB --> DS --> CAM
    end

    CAM -->|"PCM"| DAC["DAC físico<br/>hw:CARD=...,DEV=0"]

    subgraph DSD["Bypass DSD nativo"]
        COND{"Pure Direct ON<br/>+ ficheiro .dsf/.dff<br/>+ dsd_bypass ON?"}
        OUT["MPD output 'DSD Direct'<br/>mpc enable only → DoP"]
        COND -->|"sim"| OUT
    end
    MPD -.->|"avalia em cada faixa"| COND
    OUT -.->|"bitstream DSD (DoP)<br/>bypassa PipeWire + CamillaDSP"| DAC

    subgraph CTRL["Controlo — server/player.js"]
        WATCH["MPD rate watcher<br/>idle player @ :6600"]
        CWS["CamillaDSP WebSocket @ :1234<br/>SetVolume · SetConfig · GetStatus"]
    end
    WATCH -->|"muda sample-rate → SetConfig"| CAM
    WATCH -->|".dsf/.dff → applyDsdRouting()"| COND
    CWS --- CAM
    CWS -->|"clippedSamples · load · peak"| TELE["Telemetria → /api/player/signal-path"]
```

**Notas**
- **Bit-perfect:** o PipeWire publica `clock.allowed-rates` = taxas nativas do DAC; o loopback corre rate-agnostic a 32-bit e o CamillaDSP segue a taxa da fonte via *rate watcher* (`SetConfig`). Fallback de 1-toque para 48 kHz fixo.
- **Auto-headroom:** o preamp (Stage E) é atenuado pelo pico real da resposta do EQ (cascata de biquads RBJ), maximizando SNR.
- **DSD:** o dispositivo do output "DSD Direct" é detetado no install (`hw:CARD=…`, baseado em nome).

---

## 2. Fluxo da Aplicação (software)

```mermaid
flowchart TD
    subgraph CLIENTS["Clientes — React + Tailwind (Vite)"]
        KIOSK["Kiosk<br/>Chromium @ localhost:5000 · 1480x320"]
        REMOTE["Remote PWA<br/>https://host:5001/remote · auth por token (QR)"]
    end

    KIOSK <-->|"WS /ws"| WS
    REMOTE <-->|"WSS /ws + token"| WS
    KIOSK -->|"REST /api/*"| EXP
    REMOTE -->|"REST /api/* (requireAuth)"| EXP

    subgraph BACK["Backend Node.js — server/"]
        EXP["Express — index.js<br/>HTTP :5000 / HTTPS :5001"]
        WS["WebSocket hub — websocket.js<br/>wss partilhado · VU meter · standby"]
        EVT["EventService — event-service.js<br/>emit() → fila série → cache → persist → side-effects → broadcast"]
        PLAYER["player.js<br/>CamillaDSP · MPD · DAC · bit-perfect · DSD · auto-headroom"]
        SYS["system.js<br/>systemctl · nmcli · storage · backup · factory-reset"]
        SPOT["spotify-auth.js<br/>OAuth PKCE (sem secret)"]
        META["metadata.js<br/>MusicBrainz · Last.fm · TheAudioDB"]
    end

    EXP --> WS
    EXP --> EVT
    WS --> EVT
    EVT --> PLAYER
    EVT --> SYS
    EXP --> SPOT
    EXP --> META

    EVT -->|"persist"| DB[("SQLite — resonance.db<br/>settings · favorites · play_history<br/>favorite_radios · metadata_cache")]
    PLAYER --> DB
    META --> DB

    PLAYER -->|"WS :1234"| CAMILLA["CamillaDSP"]
    PLAYER -->|"mpc · :6600"| MPDD["MPD"]
    PLAYER -->|"sudo tee + systemctl"| CFG["asound.conf · PipeWire confs"]
    SYS -->|"sudo (execFile)"| SD["systemd · nmcli"]
    SPOT -->|"HTTPS"| SAPI["Spotify API"]
```

---

## 3. Sincronização de Estado (EventService)

Todas as ações de controlo passam pelo `EventService`: nunca mutam estado
diretamente — chamam `emit(type, payload)`, que serializa, persiste e faz
*broadcast* para todos os clientes (kiosk + remotes ficam sempre em sincronia).

```mermaid
sequenceDiagram
    participant U as Cliente (Remote/Kiosk)
    participant WS as WebSocket hub
    participant EVT as EventService
    participant DB as SQLite
    participant FX as Side-effect (CamillaDSP/MPD/ALSA)
    U->>WS: emit("SET_VOLUME", 42)
    WS->>EVT: enfileira evento (fila série)
    EVT->>EVT: atualiza cache de estado
    EVT->>DB: setSetting('volume', 42)
    EVT->>FX: CamillaDSP SetVolume (dB)
    EVT-->>WS: broadcast(novo estado)
    WS-->>U: todos os clientes sincronizam
```

---

## 4. Arranque & Tuning (install + boot)

```mermaid
flowchart LR
    INSTALL["install.sh"] --> PKGS["pacotes · PipeWire · MPD<br/>CamillaDSP (pin 4.1.3) · network-manager"]
    INSTALL --> RT["setup-rtaudio.sh<br/>threadirqs · rtirq · isolcpus=2,3 · CPU affinity"]
    INSTALL --> STORE["setup-storage-silence.sh<br/>noatime · log2ram"]
    INSTALL --> RAM["setup-ram-preload.sh<br/>mlockall · LimitMEMLOCK · PipeWire mlock"]
    INSTALL --> VERIFY["verify-install.sh<br/>relatório do estado final"]
    INSTALL --> REBOOT["reboot"]
    REBOOT --> BOOT["boot"]
    BOOT --> PM2["PM2: resonance-api<br/>→ startMpdRateWatcher()"]
    BOOT --> CAM["camilladsp.service"]
    BOOT --> KIOSKX["X + Chromium kiosk"]
```

**Split de cores (Pi quad-core, isolcpus=2,3):** núcleos 0/1 = OS + API + SQLite +
Chromium · núcleo 2 = PipeWire + CamillaDSP · núcleo 3 = raspotify + shairport-sync.

---

## OTA (atualização)

`scripts/update.sh`: regista o commit atual → `git reset --hard origin/main` →
`npm install` → `npm run build` → re-aplica tuning (rt-audio / storage / ram) →
reinício do PM2. Em falha de install/build/validação do servidor faz **rollback
automático** para o commit anterior (recuperação ao nível de commit; imagem
A/B imutável fica como melhoria futura).
