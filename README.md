# NEXCOUNT by Andrerer – Das Buchhaltungs- und Lagersystem für die Kleinen

Web-App für kleine Unternehmen: Rechnungen, Angebote, Kassenbuch und – wenn man eins braucht –
ein Lager. Mit Benutzeranmeldung, Teams und Echtzeit-Synchronisierung zwischen allen Geräten.

## Nur was du brauchst

Beim ersten Start wählt der Admin eine Vorlage (Dienstleister, Handel, Handwerk, Nur Kassenbuch,
Alles); danach lassen sich die Funktionen unter **Einstellungen → Funktionen** jederzeit
an- und ausschalten. Ausgeschaltete Bereiche werden nur ausgeblendet, ihre Daten bleiben erhalten.

| Funktion               | Inhalt                                                             | benötigt           |
|------------------------|--------------------------------------------------------------------|--------------------|
| Kassenbuch             | Einnahmen & Ausgaben (immer aktiv)                                 | –                  |
| Rechnungen             | Schreiben, drucken, Zahlung → Kassenbuch, Zahlungserinnerung       | Kontakte           |
| Angebote               | Angebote erstellen, mit einem Klick in eine Rechnung umwandeln     | Rechnungen         |
| Einkäufe               | Eingangsrechnungen von Lieferanten                                 | Kontakte           |
| Kunden & Lieferanten   | Adressbuch mit Umsatz je Kontakt                                   | –                  |
| Produkte & Leistungen  | Preisliste; Leistungen ohne Bestand                                | –                  |
| Lagerverwaltung        | Bestände, Wareneingang/-ausgang, Inventur, Mindestbestand          | Produkte & Leist.  |
| Berichte & Export      | EÜR, Umsatzsteuer, CSV/Backup                                      | –                  |

Bestand wird nur für **Produkte** geführt und nur, solange die Lagerverwaltung aktiv ist.
Belege, die ohne aktives Lager festgeschrieben wurden, buchen nachträglich keinen Bestand –
nach dem Einschalten des Lagers einmal eine Inventur machen.

| Teil              | Dienst                                                                  |
|-------------------|-------------------------------------------------------------------------|
| Anmeldung         | **Supabase Auth** (E-Mail + Passwort, Bestätigungsmail, Passwort vergessen) |
| Datenbank         | **Supabase Postgres** mit Row Level Security (`supabase/migrations/`)   |
| Live-Updates      | **Supabase Realtime**                                                    |
| Oberfläche        | **GitHub Pages** (statische Dateien aus `public/`)                       |

## GitHub ⇄ Supabase: so spielt alles zusammen

```
git push (main)
   ├─ .github/workflows/pages.yml     → prüft die Skripte und veröffentlicht public/ auf GitHub Pages
   └─ .github/workflows/supabase.yml  → spielt neue Dateien aus supabase/migrations/ in Supabase ein
```

- **App-Änderungen** (`public/…`): pushen → nach ca. 1 Minute live unter
  `https://git-noah2026.github.io/nexcount/`.
- **Datenbank-Änderungen**: neue Datei `supabase/migrations/<Zeitstempel>_<name>.sql` anlegen
  (z. B. `npx supabase migration new rechnungsnotizen`) → pushen → wird automatisch eingespielt.
  Bestehende Migrationen nie nachträglich ändern.

### Einmalige Einrichtung

1. **GitHub Pages aktivieren:** Repo → *Settings → Pages → Build and deployment → Source:*
   **GitHub Actions**.
2. **Secrets für Supabase** (Repo → *Settings → Secrets and variables → Actions → New repository secret*):
   - `SUPABASE_ACCESS_TOKEN` – in Supabase unter *Account → Access Tokens* erzeugen
   - `SUPABASE_DB_PASSWORD` – das beim Anlegen des Projekts erzeugte Datenbank-Passwort

   Ohne diese Secrets läuft die App trotzdem; nur das automatische Einspielen von
   Datenbank-Änderungen wird mit einem Hinweis übersprungen.
3. **Supabase → Authentication → URL Configuration:** *Site URL*
   `https://git-noah2026.github.io/nexcount/` und unter *Redirect URLs*
   `https://git-noah2026.github.io/nexcount/**` eintragen (für Bestätigungs- und Passwort-Mails).
4. [`public/config.js`](public/config.js) enthält *Project URL* und *Publishable key* – beide sind
   öffentlich gedacht. Niemals den `secret`/`service_role` Key ins Repo schreiben!

Die erste Migration ist wiederholbar geschrieben und kann gefahrlos auf eine bereits eingerichtete
Datenbank laufen. Cloudflare (`wrangler.jsonc`) ist optional und wird nicht mehr benötigt.

## Lokal entwickeln

```bash
npm install
npm run dev        # http://localhost:8787 – nutzt das in config.js eingetragene Supabase-Projekt
```

Für lokale Tests `http://localhost:8787` zusätzlich unter *Authentication → URL Configuration →
Redirect URLs* eintragen. Supabase-Bibliothek aktualisieren: `npm update @supabase/supabase-js && npm run vendor`.

## Wie die Synchronisierung funktioniert

- Jede Änderung wird sofort lokal gespeichert (offline-fähig) und paketweise an die
  Datenbankfunktion `sync` geschickt.
- `sync` schreibt alles in **einer Transaktion**, vergibt je Firma fortlaufende Revisionen und
  löst bei Konflikten nach „neueste Änderung gewinnt“ auf.
- Jede neue Revision erhöht `companies.seq`; **Realtime** meldet das allen Geräten der Firma,
  die sich dann die Änderungen holen.
- Bestände werden aus unveränderlichen Lagerbewegungen berechnet → keine Konflikte bei
  gleichzeitiger Arbeit an mehreren Geräten.

## Sicherheit

- Anmeldung, Passwort-Hashing, Sitzungen und Rate-Limits übernimmt Supabase Auth.
- **Row Level Security**: Jede Firma sieht nur ihre eigenen Daten; Mitarbeiter sehen keine
  Einladungscodes und keine Teamliste. Geschrieben wird ausschließlich über geprüfte
  Datenbankfunktionen – direkte Tabellenzugriffe zum Schreiben sind gesperrt.
- Entfernte Teammitglieder verlieren sofort jeden Zugriff.
- Content-Security-Policy und weitere Header über `public/_headers`.

## Hinweise

- Supabase verschickt im kostenlosen Plan nur wenige E-Mails pro Stunde. Für den Echtbetrieb
  unter *Authentication → Emails → SMTP Settings* einen eigenen Mail-Server eintragen.
- Kostenlose Supabase-Projekte pausieren nach einer Woche ohne Aktivität (im Dashboard wieder
  aktivierbar).
- Die Berichte sind eine Hilfe für die eigene Übersicht und ersetzen keine Steuerberatung oder
  GoBD-zertifizierte Buchhaltungssoftware.
