# Blitz Trening

Zwykła aplikacja (okno, bez nakładki i bez działania w tle), która liczy statystyki
graczy z powtórek World of Tanks Blitz i zapisuje je do Excela w układzie:

| | BITWY | DMG | FRAGI | STRZAŁY | PRZEBITE | ZABLOKOWANE | FRAGI |
|---|---|---|---|---|---|---|---|

## Jak używać
1. Przeciągnij do okna powtórki (`.wotbreplay`) – jedną albo wiele naraz.
2. Tabela uzupełni się sama. Ta sama bitwa nie policzy się dwa razy.
3. **Suma / Średnia na bitwę** – przełącznik nad tabelą. Kliknięcie nagłówka sortuje.
4. **Zapisz do Excela** tworzy plik z trzema arkuszami:
   - *Tabela* – sumy, z kolorami jak w Twoim arkuszu,
   - *Średnie* – średnie na bitwę,
   - *Bitwy* – każdy gracz w każdej bitwie osobno.
5. Zapisany plik Excela można przeciągnąć z powrotem do aplikacji, żeby wczytać wyniki.

### Zakładki
- **Bitwy** – lista dodanych bitew, usuwanie pojedynczych, „Wyczyść wszystko” na nową tabelę.
- **Inni gracze** – nicki z powtórek spoza tabeli. Można je przypisać do gracza z tabeli
  (np. gdy ktoś zmienił nick) albo dodać jako nowego.
- **Lista graczy** – kolejność i nazwy w tabeli. Wielkość liter nie ma znaczenia.

## Ważne
- Każda powtórka zawiera wyniki wszystkich graczy z bitwy, więc wystarczy jedna powtórka na bitwę.
  Jeśli kilka osób wrzuci powtórkę z tej samej bitwy, wyniki się nie zdublują.
- Powtórka z przerwanej bitwy (np. wyjście z pokoju po kilku sekundach) nie ma wyników
  – aplikacja ją pominie i powie dlaczego.
- Zrzuty ekranu nie są obsługiwane: na ekranie wyników nie widać strzałów, przebić
  ani zablokowanych innych graczy.

## Zbudowanie .exe na GitHubie
Tak samo jak przy nakładce: wgraj pliki do nowego repozytorium (`blitz-trening`),
dodaj plik `.github/workflows/build-exe.yml`, a w zakładce **Actions** pobierz
`Blitz-Trening-Windows`.

Odczyt powtórek opiera się na budowie plików opisanej w projekcie
eigenein/wotbreplay-parser (licencja MIT). Biblioteki: fflate, ExcelJS (licencje w `app/lib`).
