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

---

## 5. Pipeline interno do CamillaDSP (stages A→E)

Gerado por `generateCamillaConfig()` em `server/player.js`. O sinal entra pelo
`loop_dsnoop`, passa pelo *mixer* (mapeamento de canais + balance) e por uma
cadeia de filtros por canal; o volume é aplicado **fora** do pipeline via
`SetVolume` (pós-buffer, latência zero). Em **Pure Direct** todo o bloco de EQ
é saltado — fica só o mixer (+ phase).

```mermaid
flowchart TD
    CAP["Capture · loop_dsnoop<br/>S32_LE (bit-perfect) / S16_LE"]
    CAP --> MIX["Mixer 'speaker_map'<br/>2→2 (ou 2→3 c/ subwoofer)<br/>balance: ganho L/R"]

    MIX --> PD{"Pure Direct?"}
    PD -->|"sim"| PHA
    PD -->|"não"| A

    subgraph CHAIN["Cadeia de filtros (por canal)"]
        A["Stage A · Room Correction<br/>curva Harman (se calibrado)"]
        B["Stage B · EQ de perfil<br/>5 bandas (Lowshelf/Peaking/Highshelf)<br/>+ saturação analógica (opcional)"]
        C["Stage C · Ajustes de sala"]
        D["Stage D · Crossover<br/>highpass mains · lowpass sub (se subwoofer)"]
        E["Stage E · Preamp gain<br/>−pico(EQ) auto-headroom · −1 dB safety · −6 dB se DSP"]
        A --> B --> C --> D --> E
    end

    E --> PHA["Phase · inversão de polaridade<br/>phase_left / phase_right (opcional)"]
    PHA --> OUT["Playback · hw:CARD=DAC,DEV=0<br/>S32/S24 (formato nativo do DAC)"]

    VOL["CamillaDSP WS :1234 · SetVolume (dB)"] -.->|"pós-buffer, fora do pipeline"| OUT
```

---

## 6. Autenticação Spotify (OAuth Authorization Code + PKCE)

`server/spotify-auth.js`. **Sem client secret** no dispositivo — o cliente prova
posse de um `code_verifier` único (PKCE). Só o Client ID (público) é necessário.

```mermaid
sequenceDiagram
    participant B as Browser (kiosk/remote)
    participant S as Server · spotify-auth.js
    participant SP as Spotify Accounts
    participant API as Spotify API
    participant DB as SQLite

    B->>S: GET /auth/spotify/login
    S->>S: gera state + PKCE<br/>verifier + challenge (S256)
    S-->>B: redirect → accounts.spotify.com/authorize<br/>(client_id, code_challenge, scopes, state)
    B->>SP: utilizador autoriza
    SP-->>B: redirect → /callback?code&state
    B->>S: GET /auth/spotify/callback
    S->>S: valida state (CSRF)
    S->>SP: POST /api/token<br/>code + code_verifier + client_id<br/>(SEM secret)
    SP-->>S: access_token + refresh_token
    S->>API: GET /v1/me (display name)
    S->>DB: persiste tokens
    S-->>B: redirect app · emit SET_TOKEN

    Note over S,SP: Refresh automático (a cada ~4 min)<br/>grant_type=refresh_token + client_id, sem secret
```
