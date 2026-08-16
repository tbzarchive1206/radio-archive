# RADIO ARCHIVE

Samodzielne, statyczne repozytorium GitHub Pages dla archiwum audycji radiowych THE BOYZ. Strona zachowuje kobaltowo-białą stylistykę pozostałych repozytoriów projektu.

## Co zawiera

- cztery główne działy: Idol Radio, Radio Series, DJ Programs i Guest Appearances;
- indeks wpisów aktualizowany automatycznie z Google Drive i Google Sheets;
- zdjęcia, pliki audio i wideo dostępne w galeriach;
- pełnotekstowe wyszukiwanie po tytule, dacie `YYMMDD`, numerze odcinka, członku i gościu;
- kontekstowe filtry roku, członka/DJ-a i zakresu numerów odcinków;
- sortowanie od najnowszych lub najstarszych;
- galerie zdjęć połączone z Idol Radio Season 4 na podstawie daty `YYMMDD`;
- raport folderów, których nie udało się jeszcze połączyć z rekordem arkusza;
- automatyczną synchronizację dwa razy dziennie;
- publikację przez GitHub Actions i GitHub Pages.

## Publikacja krok po kroku

### 1. Utwórz repozytorium

Na GitHubie wybierz **New repository** i utwórz publiczne repozytorium, najlepiej o nazwie:

```text
RADIO-ARCHIVE
```

Nie dodawaj automatycznie README ani `.gitignore`, ponieważ są już w tym projekcie.

### 2. Prześlij pliki

Możesz użyć **Add file → Upload files** i przesłać całą zawartość tego folderu albo użyć Git:

```bash
git remote add origin https://github.com/TWOJ_LOGIN/RADIO-ARCHIVE.git
git push -u origin main
```

Zastąp `TWOJ_LOGIN` własnym loginem GitHub.

### 3. Dodaj klucz Google Drive API

W repozytorium otwórz:

**Settings → Secrets and variables → Actions → New repository secret**

Ustaw:

```text
Name: GOOGLE_DRIVE_API_KEY
Secret: TWÓJ_KLUCZ_API
```

Klucz nie jest umieszczany w kodzie strony. Jest używany wyłącznie przez GitHub Actions.

Zalecane ograniczenia klucza w Google Cloud:

- API restrictions: **Google Drive API** i **Google Sheets API**;
- nie zapisuj klucza w `app.js`, `archive-data.js` ani w README.

### 4. Włącz GitHub Pages

Przed pierwszym ręcznym uruchomieniem workflow otwórz:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Ten krok jest ważny. Jeśli Pages nie jest jeszcze włączone, akcja `configure-pages` może zwrócić błąd „Get Pages site failed”.

### 5. Uruchom pierwszą synchronizację

Otwórz:

**Actions → Sync Radio Archive and deploy Pages → Run workflow**

Workflow:

1. pobierze dane z arkusza Season 4;
2. przeskanuje cały folder Radio Archive;
3. połączy galerie z odcinkami;
4. uruchomi testy;
5. zapisze zaktualizowany indeks;
6. opublikuje `_site` jako GitHub Pages.

Po zakończeniu adres strony będzie widoczny w **Settings → Pages** oraz w podsumowaniu zadania `deploy`.

## Automatyczne aktualizacje

Workflow uruchamia się codziennie o:

- `04:17 UTC`;
- `16:17 UTC`.

Nowe rekordy Season 4 dodawaj do arkusza:

<https://docs.google.com/spreadsheets/d/13xdu9lNVG9cUriFfBfhQewghUZfwwCLY0tIFuEhSOTU/edit>

Kolumny powinny pozostać w układzie:

```text
# | Date | Name | DJ | Guest | Youtube | Photos
```

Data musi mieć format `YYMMDD`, np. `260616`. Folder galerii powinien zawierać tę samą datę w nazwie. Skrypt dodatkowo sprawdza link z kolumny `Photos`.

Folder zdjęć bez rekordu arkusza nie jest publikowany jako uszkodzony odcinek. Trafia do `data/sync-report.json` i pojawi się na stronie dopiero po dodaniu pasującego wiersza.

## Obsługa członków

Główny filtr zawiera aktualnych członków:

```text
Sangyeon, Jacob, Younghoon, Hyunjae, Juyeon, Kevin, Q, Sunwoo, Eric
```

Historyczne odcinki prowadzone przez New/Chanhee, Haknyeona lub zewnętrznego współprowadzącego nie są usuwane. Są dostępne pod filtrem **Special / Other DJs**.

## Test lokalny

Wymagane są Node.js i Python 3:

```bash
npm test
npm run build
python -m http.server 8000 --directory _site
```

Następnie otwórz `http://localhost:8000`.

Ręczna synchronizacja lokalna:

```bash
set GOOGLE_DRIVE_API_KEY=TWÓJ_KLUCZ
python scripts/sync_archive.py
```

W PowerShell:

```powershell
$env:GOOGLE_DRIVE_API_KEY="TWÓJ_KLUCZ"
python scripts/sync_archive.py
```

## Najważniejsze pliki

- `index.html` — szkielet strony;
- `styles.css` — responsywny wygląd;
- `app.js` — routing, wyszukiwarka, filtry i galerie;
- `data/archive-data.js` — statyczny indeks archiwum;
- `scripts/sync_archive.py` — synchronizacja Drive i Sheets;
- `scripts/prepare_site.py` — przygotowanie artefaktu GitHub Pages;
- `.github/workflows/sync-and-deploy.yml` — aktualizacja i publikacja.
