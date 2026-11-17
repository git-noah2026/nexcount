# NEXCOUNT – Buchhaltungs- & Lagersystem by Andrerer

Web-App für kleine Unternehmen: Warenwirtschaft, Rechnungen, Kassenbuch und Auswertungen –
mit Benutzeranmeldung, Teams und Echtzeit-Synchronisierung zwischen allen Geräten.

Läuft auf **Cloudflare**:

| Teil                | Cloudflare-Dienst                                                   |
|---------------------|---------------------------------------------------------------------|
| Frontend            | Workers Static Assets (`public/`)                                    |
| API & Anmeldung     | Worker (`src/worker.js`)                                             |
| Datenbank           | **D1** (SQLite) – Benutzer, Firmen, Sitzungen und alle Geschäftsdaten |
| Live-Updates        | **Durable Object** `SyncHub` je Firma, WebSocket (Hibernation)       |
| Aufräumen           | Cron-Trigger täglich (abgelaufene Sitzungen)                         |

## Veröffentlichen über GitHub (empfohlen)

GitHub enthält den Code, die Datenbank liegt bei Cloudflare. Jeder Push auf `main` wird automatisch
veröffentlicht (Cloudflare Workers Builds) – ohne GitHub-Actions und ohne Secrets im Repo.

**1. D1-Datenbank einmalig anlegen**
Cloudflare-Dashboard → *Storage & Databases → D1 → Create* → Name **`nexcount-db`**.
Die angezeigte **Database ID** in `wrangler.jsonc` bei `database_id` eintragen (ersetzt `00000000-…`)
und committen. Die ID ist kein Geheimnis.

**2. Code auf GitHub pushen**
Leeres Repository auf GitHub anlegen (am besten *privat*), dann:

```bash
git remote add origin https://github.com/<konto>/nexcount.git
git push -u origin main
```

**3. Repository mit Cloudflare verbinden**
Dashboard → *Workers & Pages → Create → Import a repository* → GitHub-Konto verbinden → Repo wählen.

| Einstellung       | Wert                |
|-------------------|---------------------|
| Projektname       | `nexcount`          |
| Build command     | *(leer lassen)*     |
| Deploy command    | `npm run deploy`    |
| Root directory    | `/`                 |
| Branch            | `main`              |

`npm run deploy` wendet zuerst neue Datenbank-Migrationen aus `migrations/` an und veröffentlicht
dann Worker, Durable Object und Frontend. Die Adresse lautet z. B.
`https://nexcount.<dein-name>.workers.dev`; eine eigene Domain verbindest du unter
*Workers → nexcount → Settings → Domains & Routes*.

## Alternativ: direkt vom Rechner veröffentlichen

```bash
npm install
npx wrangler login                 # Cloudflare-Anmeldung im Browser
npm run db:create                  # D1-Datenbank anlegen → database_id in wrangler.jsonc eintragen
npm run deploy                     # Migrationen anwenden + veröffentlichen
```

## Lokal entwickeln

```bash
npm run db:migrate:local           # einmalig: lokale D1-Datenbank anlegen
npm run dev                        # http://localhost:8787
```

Lokal laufen D1 und Durable Objects vollständig simuliert (Daten in `.wrangler/`).

Datenbank-Änderungen immer als neue Datei in `migrations/` anlegen
(`npx wrangler d1 migrations create nexcount-db <name>`), nie bestehende Migrationen ändern –
beim nächsten Push werden sie automatisch auf die Live-Datenbank angewendet.

## Nützliche Befehle

| Befehl                                   | Zweck                                         |
|------------------------------------------|-----------------------------------------------|
| `npm run logs`                           | Live-Logs des Workers                         |
| `npx wrangler d1 export nexcount-db --remote --output backup.sql` | Datenbank-Backup  |
| `npx wrangler d1 time-travel info nexcount-db` | Wiederherstellungspunkte (D1 Time Travel, 30 Tage) |

## Funktionen

- **Anmeldung & Team** – Registrierung mit eigener Firma oder per Einladungscode, Rollen
  Admin/Mitarbeiter, Benutzer entfernen (wird sofort getrennt), Passwort ändern
  (beendet andere Sitzungen).
- **Synchronisierung** – Änderungen werden lokal gespeichert, paketweise an den Worker gesendet
  und in einer D1-Transaktion mit fortlaufender Revision geschrieben. Andere Geräte erhalten
  sofort ein Signal per WebSocket. Offline wird weitergearbeitet und später nachgereicht.
  Bei Konflikten gewinnt die neueste Änderung je Datensatz.
- **Artikel, Lager, Belege, Buchungen, Kontakte, Berichte** – siehe App; Bestände werden aus
  unveränderlichen Lagerbewegungen berechnet, Rechnungen buchen Lager und Kassenbuch automatisch.
- CSV-Export (Excel), JSON-Backup, Druck/PDF, Hell/Dunkel, mobil nutzbar, als App installierbar.

## Sicherheit

- Passwörter mit PBKDF2-SHA256 (100.000 Iterationen, Salt), Sitzungen als HttpOnly-/Secure-Cookie,
  Tokens nur gehasht in D1.
- CSRF-Schutz über Pflicht-Header, Origin-Prüfung für WebSockets, Content-Security-Policy
  (`public/_headers`), Begrenzung von Anmelde- und Registrierungsversuchen pro IP.
- Strikte Mandantentrennung: Jede Firma sieht nur ihre eigenen Daten.

## Limits & Kosten

- Der **Free-Plan** reicht für kleine Teams. Wegen des D1-Limits von 50 Abfragen pro Anfrage
  sendet die App höchstens 40 Änderungen je Sync-Paket (größere Mengen werden automatisch aufgeteilt).
- Das Passwort-Hashing braucht etwas Rechenzeit. Sollte die Anmeldung im Free-Plan gelegentlich
  am CPU-Limit scheitern, hilft der **Workers Paid-Plan** (5 $/Monat). Dort kannst du
  `MAX_OPS` in `wrangler.jsonc` auf bis zu 500 erhöhen (und `SYNC_BATCH` in `public/app.js` gleich setzen).

## Hinweis

Die Berichte sind eine Hilfe für die eigene Übersicht und ersetzen keine Steuerberatung oder
GoBD-zertifizierte Buchhaltungssoftware.
