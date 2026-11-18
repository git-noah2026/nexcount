# NEXCOUNT by Andrerer – Das Buchhaltungs- und Lagersystem für die Kleinen

Web-App für Selbstständige, Dienstleister, Kleinunternehmen und Vereine: Rechnungen, Angebote,
Zeiterfassung, Mitglieder, Beiträge, Spenden, Kassabuch – verknüpfbar mit **NEXLOGISTIC** (Lager & Logistik).
Ausgelegt auf **Österreich** (UStG 1994, BAO, EStG) – siehe unten.
Mit Benutzeranmeldung, Teams und Echtzeit-Synchronisierung zwischen allen Geräten.

## Für jede Organisation das Richtige

Die Registrierung fragt in drei Schritten nach **Art der Organisation**, Name/Rechtsform/Steuerstatus
und Zugang; danach führt ein Einrichtungsassistent durch Angaben und Funktionen.

| Art                               | Vorgeschlagene Funktionen                                                  |
|-----------------------------------|-----------------------------------------------------------------------------|
| Einzelunternehmer & Freiberufler  | Rechnungen, Angebote, Zeiterfassung, Kunden, Preisliste, Berichte           |
| Dienstleistungsunternehmen        | wie oben + Einkäufe                                                         |
| Kleinunternehmen & Handel         | Rechnungen, Angebote, Einkäufe, Kunden & Lieferanten, Preisliste, Berichte  |
| Verein                            | Mitglieder, Beitragsläufe, Spenden mit Spendenmeldung, Kassabericht         |

Je nach Art passen sich Begriffe, Kategorien, Übersicht und Berichte an (Verein: Kassastand,
Buchungen nach Bereichen laut BAO – ideell, unentbehrlicher/entbehrlicher Hilfsbetrieb,
begünstigungsschädlicher Betrieb, Vermögensverwaltung).
Alle Funktionen lassen sich unter **Einstellungen → Funktionen** jederzeit an- und ausschalten;
ausgeschaltete Bereiche werden nur ausgeblendet, ihre Daten bleiben erhalten.

## Österreich

- **Rechtsformen:** e.U., GmbH, FlexCo, OG, KG, GesbR, Einzelunternehmen, Neue Selbständige; Verein mit ZVR-Zahl.
- **Umsatzsteuer:** Sätze 20 / 13 / 10 / 0 %; Kleinunternehmerregelung nach § 6 Abs. 1 Z 27 UStG
  (Hinweis auf der Rechnung); Rechnungen mit UID-Nr., Leistungsdatum und Firmenbuchnummer.
- **Berichte:** Einnahmen-Ausgaben-Rechnung und USt-Übersicht mit den UVA-Kennzahlen (KZ 022, 006, 029, 060, 095).
- **Kassabuch:** Hinweis auf die Registrierkassenpflicht (§ 131b BAO) – NEXCOUNT ist keine RKSV-Registrierkasse.
- **Vereine:** Gemeinnützigkeit nach §§ 34 ff. BAO, Bereiche inkl. § 45a-Hinweis (40.000 €),
  Spendenbestätigung mit Registrierungsnummer (BMF-Liste) und Jahresliste für die Spendenmeldung
  (Vor-/Zuname + Geburtsdatum, § 18 Abs. 8 EStG; Übermittlung bis Ende Februar über FinanzOnline).

Die Angaben entsprechen dem Stand 2025 und ersetzen keine Steuerberatung.

## Belege, Zahlungen & Mahnwesen

- **Zahlungsziel:** Standard unter *Einstellungen → Belege*, je Kunde/Lieferant überschreibbar; Fälligkeit
  wird aus Rechnungsdatum + Zahlungsziel berechnet. Eigener Text für die Zahlungsbedingungen mit Platzhaltern.
- **Skonto:** z. B. 2 % in 7 Tagen – auf der Rechnung ausgewiesen, beim Zahlungseingang automatisch
  vorgeschlagen. Gebucht wird nur der erhaltene Betrag (USt mindert sich anteilig).
- **Zahlungen:** Teilzahlungen, Skonto/Nachlass, Zahlungsverlauf je Beleg, Zahlung wieder löschbar.
- **Ausgangsrechnungen:** Kennzahlen (offen, überfällig, fällig in 7 Tagen, Zahlungseingänge), Statusfilter
  mit Zählern (inkl. „mahnreif“), Filter nach Kunde/Jahr, Sortierung, Schnellaktionen je Zeile,
  „versendet“-Markierung, E-Mail-Entwurf und vier Mahnstufen mit Mahnspesen.
- **Eingangsrechnungen:** Rechnungsnr. des Lieferanten, Rechnungs-/Eingangs-/Leistungsdatum, Fälligkeit,
  Lieferanten-Skonto („Skonto nutzbar“), Ausgabenkategorie und Ablageort.

## Mein Konto

Name, E-Mail-Adresse (mit Bestätigungslink) und Passwort (mit Prüfung des aktuellen) ändern, auf allen
Geräten abmelden, Datenexport, Organisation verlassen, Organisation löschen und **Konto löschen**.
Die drei letzten Funktionen brauchen die Migration `20261118200000_account.sql` (Workflow „Supabase-Datenbank“).

## Lager: NEXLOGISTIC verknüpfen

Das Lager ist seit November 2026 eine eigene App der NEX-Familie: **NEXLOGISTIC** (Bestände, Wareneingang,
Inventur, Versand). NEXCOUNT hat keinen eigenen Lager-Bereich mehr, kann NEXLOGISTIC aber verknüpfen
(*Einstellungen → Funktionen → NEXLOGISTIC*):

- **Verknüpfen:** mit einem Klick, wenn man in beiden Apps Admin ist – sonst mit einem Verknüpfungscode
  (`NC-…`, 24 h gültig), den ein NEXLOGISTIC-Admin unter *Einstellungen → Verknüpfung mit NEXCOUNT* erzeugt.
- **Preisliste:** Produkte lassen sich mit einem Lagerartikel verbinden und zeigen dann den Bestand;
  „Aus Lager“ übernimmt Lagerartikel als Produkte.
- **Belege:** Festgeschriebene Rechnungen buchen Warenausgänge, erfasste Eingangsrechnungen Wareneingänge
  (inkl. Einkaufspreis, gleitender Durchschnitt), Stornos buchen zurück. Ohne Internet wird nachgeholt;
  doppelte Buchungen sind ausgeschlossen (Bewegungs-IDs aus Beleg + Position).
- **Altes NEXCOUNT-Lager:** bleibt gespeichert und lässt sich nach dem Verknüpfen mit einem Klick
  (Artikel + aktueller Bestand) nach NEXLOGISTIC übernehmen oder als CSV exportieren.

Die Datenbankfunktionen dafür (`nl_link_*`) liegen im NEXLOGISTIC-Repo, weil sie dessen Tabellen beschreiben.

## Technik

| Teil              | Dienst                                                                  |
|-------------------|-------------------------------------------------------------------------|
| Anmeldung         | **Supabase Auth** (E-Mail + Passwort, Bestätigungsmail, Passwort vergessen) |
| Datenbank         | **Supabase Postgres** mit Row Level Security (`supabase/migrations/`)   |
| Live-Updates      | **Supabase Realtime**                                                    |
| Oberfläche        | **Cloudflare Workers** (statische Dateien aus `public/`), aus GitHub gebaut |

## GitHub ⇄ Cloudflare ⇄ Supabase: so spielt alles zusammen

```
git push (main)
   ├─ .github/workflows/deploy.yml    → prüft die Skripte, veröffentlicht zu Cloudflare → https://nexcount.andrerer.org
   └─ .github/workflows/supabase.yml  → spielt neue Dateien aus supabase/migrations/ in Supabase ein
```

- **App-Änderungen** (`public/…`): pushen → nach ca. 1 Minute live. Erfolg oder Fehler steht
  auf GitHub im Reiter **Actions**.
- **Datenbank-Änderungen**: neue Datei `supabase/migrations/<Zeitstempel>_<name>.sql` anlegen
  (z. B. `npx supabase migration new rechnungsnotizen`) → pushen → wird automatisch eingespielt.
  Bestehende Migrationen nie nachträglich ändern.

### Einmalige Einrichtung

1. **Secrets für Cloudflare** (Repo → *Settings → Secrets and variables → Actions*):
   - `CLOUDFLARE_API_TOKEN` – Cloudflare → *My Profile → API Tokens → Create Token* →
     Vorlage **„Edit Cloudflare Workers“**
   - `CLOUDFLARE_ACCOUNT_ID` – Cloudflare-Dashboard, Kontoübersicht („Account ID“)

   Die Domain `nexcount.andrerer.org` ist im Cloudflare-Dashboard am Worker `nexcount` eingetragen
   und bleibt bei jeder Veröffentlichung bestehen.
2. **Secrets für Supabase** (Repo → *Settings → Secrets and variables → Actions → New repository secret*):
   - `SUPABASE_ACCESS_TOKEN` – in Supabase unter *Account → Access Tokens* erzeugen
   - `SUPABASE_DB_PASSWORD` – das beim Anlegen des Projekts erzeugte Datenbank-Passwort

   Ohne diese Secrets läuft die App trotzdem; nur das automatische Einspielen von
   Datenbank-Änderungen wird mit einem Hinweis übersprungen.
3. **Supabase → Authentication → URL Configuration:** *Site URL*
   `https://nexcount.andrerer.org` und unter *Redirect URLs* `https://nexcount.andrerer.org/**`
   (für Bestätigungs- und Passwort-Mails).
4. [`public/config.js`](public/config.js) enthält *Project URL* und *Publishable key* – beide sind
   öffentlich gedacht. Niemals den `secret`/`service_role` Key ins Repo schreiben!

Die erste Migration ist wiederholbar geschrieben und kann gefahrlos auf eine bereits eingerichtete
Datenbank laufen. Die App nutzt relative Pfade und funktioniert daher auch unter einem Unterpfad
(z. B. GitHub Pages), falls die Auslieferung später einmal wechseln soll.

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
- Die Berichte sind eine Hilfe für die eigene Übersicht und ersetzen weder Steuerberatung noch
  eine Registrierkasse nach RKSV.
