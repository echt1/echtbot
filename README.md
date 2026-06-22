# Custom Discord Bot

Eigener Discord-Bot mit Moderation, Custom Embeds, Ticket-System und Social-Media-Benachrichtigungen (YouTube, Twitch, TikTok).

## Features

- **Moderation**: `/ban`, `/kick`, `/mute`, `/warn`, `/warnings`
- **Automod**: `/automod` - Bad-Word-Filter, Invite-Link-Blocker, Spam-Schutz, konfigurierbare Reaktion (Warn/Mute/Kick)
- **Custom Embeds**: `/embed` - eigene Embed-Nachrichten in jeden Channel senden
- **Ticket-System**: `/ticket-setup` postet ein Panel mit Button, User öffnen darüber private Ticket-Channels
- **Social Media Notifications**: `/socialnotify` - automatische Benachrichtigung bei neuen YouTube-Videos, Twitch-Streams und TikTok-Videos

## Setup

### 1. Abhängigkeiten installieren

```bash
npm install
```

### 2. `.env` Datei anlegen

Kopiere `.env.example` zu `.env` und trage deine Daten ein:

```bash
cp .env.example .env
```

- `DISCORD_TOKEN`: Discord Developer Portal → deine App → Bot → Reset Token
- `CLIENT_ID`: Discord Developer Portal → deine App → General Information → Application ID
- `GUILD_ID` (optional, für Entwicklung empfohlen): Rechtsklick auf deinen Server in Discord → "ID kopieren" (Entwicklermodus muss in den Discord-Einstellungen aktiviert sein)
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` (nur falls Twitch-Notifications genutzt werden sollen): kostenlos auf https://dev.twitch.tv/console/apps registrieren

### 3. Wichtig: Privileged Intents aktivieren

Im Discord Developer Portal unter **Bot**:
- ✅ **Server Members Intent** aktivieren (für Moderation nötig)
- ✅ **Message Content Intent** aktivieren (für Automod nötig)

Ohne diese beiden Häkchen startet der Bot nicht korrekt durch.

### 4. Bot zum Server einladen

OAuth2 → URL Generator → Scopes: `bot`, `applications.commands` → Bot Permissions: mindestens `Administrator` (am einfachsten) oder gezielt Ban/Kick/Moderate/Manage Channels/Manage Roles. Die generierte URL im Browser öffnen und Bot einladen.

### 5. Slash Commands registrieren

```bash
npm run deploy
```

Mit gesetzter `GUILD_ID` sind die Commands **sofort** sichtbar. Ohne `GUILD_ID` (global) kann es bis zu 1 Stunde dauern.

### 6. Bot starten

```bash
npm start
```

## Auf einem Free-Host deployen (z.B. Bot-Hosting.net, Wispbyte)

1. Repo/Ordner als ZIP hochladen oder via Git verbinden
2. Startup-Command: `node src/index.js` (Pterodactyl-Panels erkennen das meist über eine "Node.js"-Egg automatisch)
3. Environment-Variablen aus deiner `.env` in das Panel übertragen (NICHT die `.env` Datei selbst hochladen, sondern Variablen einzeln im Panel eintragen)
4. Einmalig `npm run deploy` über die Panel-Konsole ausführen, damit die Slash Commands registriert werden
5. Bot starten - läuft jetzt 24/7 unabhängig von deinem eigenen PC

## Social Media Notifications einrichten

```
/socialnotify add plattform:YouTube kennung:UCxxxxxxxxxxxx channel:#ankündigungen
/socialnotify add plattform:Twitch kennung:deinusername channel:#stream-alerts
/socialnotify add plattform:TikTok kennung:deinusername channel:#tiktok-feed
```

- **YouTube**: Braucht die Channel-ID (beginnt mit `UC...`), nicht den @-Handle. Findest du z.B. über die Kanal-Beschreibung oder Tools wie commentpicker.com/youtube-channel-id.html
- **Twitch**: Braucht `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` in der `.env`, sonst funktioniert die Prüfung nicht
- **TikTok**: Läuft über eine inoffizielle RSS-Bridge (rsshub.app), da TikTok keine offizielle kostenlose API anbietet. Kann gelegentlich instabil sein - falls es öfter ausfällt, sag Bescheid, dann bauen wir einen alternativen Bridge-Host ein

Der Bot prüft alle 5 Minuten auf neue Inhalte.

## Eigene Erweiterungen

Neue Slash Commands: einfach eine neue Datei in `src/commands/` nach dem Schema der bestehenden Commands anlegen, danach `npm run deploy` ausführen. Sag mir einfach, was der Bot noch können soll - ich erweitere das Projekt dann gezielt.
