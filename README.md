Nowe rekordy Season 4 do arkusza:

<https://docs.google.com/spreadsheets/d/13xdu9lNVG9cUriFfBfhQewghUZfwwCLY0tIFuEhSOTU/edit>

Kolumny powinny pozostać w układzie:

```text
# | Date | Name | DJ | Guest | Youtube | Photos
```

Data musi mieć format `YYMMDD`, np. `260616`. Folder galerii powinien zawierać tę samą datę w nazwie. Skrypt dodatkowo sprawdza link z kolumny `Photos`.

Folder zdjęć bez rekordu arkusza nie jest publikowany jako uszkodzony odcinek. Trafia do `data/sync-report.json` i pojawi się na stronie dopiero po dodaniu pasującego wiersza.

## Najważniejsze pliki

- `index.html` — szkielet strony;
- `styles.css` — responsywny wygląd;
- `app.js` — routing, wyszukiwarka, filtry i galerie;
- `data/archive-data.js` — statyczny indeks archiwum;
- `scripts/sync_archive.py` — synchronizacja Drive i Sheets;
- `scripts/prepare_site.py` — przygotowanie artefaktu GitHub Pages;
- `.github/workflows/sync-and-deploy.yml` — aktualizacja i publikacja.
