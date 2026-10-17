# Volleyball game tracker

A courtside volleyball scorer for a coach or bench player holding a phone in one hand. Tap the half of the court that won the rally and the point is on the scoreboard straight away. Then, if there is time, say how the rally ended and who did it. The app keeps the score, sets, serve and rotation, runs, a momentum chart and a per-player report.

Live site: https://nathankagoro.github.io/Volleyball-game-tracker/

It is a static page with no framework and no build step beyond copying files. Everything runs in the browser and the match is saved in `localStorage` on the phone. Nothing is sent anywhere.

## A rebuild of `legacy/Test.py`

This started as a 313-line Tkinter and Matplotlib desktop script, kept unchanged in [`legacy/`](legacy/) with the chart and the report it produced. You typed shirt numbers for "Us" and "Opponent", clicked who won each rally, picked one of eleven causes and a player, and watched a running momentum line. At 25 points it saved the chart and a text report.

The web app keeps that idea and fixes these bugs in the original:

| Original behaviour | Now |
| --- | --- |
| A set ended as soon as either side reached 25, so 25–24 counted as a win | A set is won at 25 with a two-point lead and no cap. The deciding set goes to 15, also by two. Best of 3 or best of 5 |
| After 25 it kept scoring and wrote a new report and chart on every further point | The match ends when a team has won enough sets; further scoring is refused until you undo or start a new match |
| Players were keyed by shirt number only. With both teams numbered 1 to 6, every player appeared twice in the report with both teams' actions merged (the bundled `game_report_*.txt` shows it) | Players are keyed by team and number. Each player is listed once, under their own team |
| You could only pick a player from the team that won the rally, so a "Passing Error" was booked against the team that won the point | Each rally records the winner, how it ended and who did it. Aces, kills, blocks and tips are credited to the winning team; serving, hitting and passing errors, net or rotation faults, ball handling and balls out are charged to the losing team. "Point only" records no detail |
| No undo | Undo is one tap, or Z on a keyboard |
| Splitting the roster on commas kept spaces and blank entries as players | Roster input trims spaces, ignores empty entries, refuses duplicates (07 and 7 are the same shirt) and accepts optional names |
| Everything was lost when the window closed | The match is saved on every tap and survives a refresh or a locked phone |
| No serve or rotation | Serve and rotation are derived from the rallies, so aces and serving errors go to whoever was serving without asking, and side-out percentage is exact |

## What is real and what is illustrative

- The scoring rules, statistics, report and chart are real and are what you get when you score your own match.
- The page opens on a **sample match** so visitors see it working. The teams (Kestrels and Quayside), players and every rally are made up, generated from a fixed seed through the same rules as live scoring. A strip at the top of the page says so while the sample is loaded, and the exported report says so too.

## Using it

1. **Setup**: team names, shirt numbers (one per line or comma separated, a name after the number is optional), best of 3 or 5 and who serves first. The first six players listed start on court in serving order.
2. **Court**: each half of the court is that team's point button and shows its players in their rotation spots, with a ball by the server. After a point a sheet asks how the rally ended (two taps for an ace or a serving error, three for anything that needs a player). "Point only", Escape or tapping outside keeps the point without detail. "Wrong side: undo" takes it back.
3. **Stats**: set scores, momentum chart (with a rally-by-rally table for screen readers), how each team won its points (earned against opponent errors), side-out and serve percentages, runs, and a table per team of each player's points, errors and net contribution.
4. **Export**: share the text report (Web Share API, with the match file attached where supported), copy it, or download the report, the match as JSON, or the chart as PNG.

Keyboard on a desktop: U or Left arrow scores for the home side, O or Right arrow for the away side, Z undoes. In the sheet, Tab moves between choices and Escape closes it.

On phones it buzzes on each point where vibration is supported (switch it off in Setup) and keeps the screen awake while scoring where the Wake Lock API is available.

## Code

| Path | What it is |
| --- | --- |
| `js/logic.js` | Pure match logic. A match is a list of events (`rally`, `sub`, `serve`); `derive()` rebuilds the score, sets, serve, rotation, runs and all statistics from them |
| `js/report.js` | Plain-text report and JSON export |
| `js/chart.js` | Momentum chart as an SVG string, used on the page and for the PNG export |
| `js/sample.js` | Seeded generator for the fictional sample match |
| `js/app.js` | Page wiring: scoreboard, court, picker, dialogs, storage, export, keyboard, wake lock |
| `css/app.css` | Styles. Fonts are self-hosted: Big Shoulders Display and DSEG7 Classic, both SIL OFL (see `fonts/LICENSES.txt`) |
| `tests/` | Unit tests for the logic, report and chart |
| `tools/` | Local server, build, screenshot run, browser flow test and preview image renderer |
| `legacy/` | The original Python script and its output, unchanged |

## Run, build and test

Needs Node 22. No dependencies are needed to run the site or the unit tests.

```sh
npm test                # unit tests (node --test)
npm start               # serves the repo at http://127.0.0.1:4390/Volleyball-game-tracker/
npm run build           # copies the files visitors need into _site/
```

Browser checks use `puppeteer-core` and an installed Chrome (`npm ci` first; set `CHROME_PATH` if Chrome is not in the usual place):

```sh
npm run build
npm run flow            # drives a scoring session: taps, picker, keyboard, undo, setup, subs, export
npm run screenshots     # shots/ at 1440, 390 and 360 px; fails if the live screen scrolls on a phone
npm run og              # re-renders assets/og.png from the page
```

## Hosting

GitHub Pages, deployed by `.github/workflows/pages.yml` on every push to `main`: it runs the tests, builds `_site/` and publishes only that. `.github/workflows/ci.yml` runs the tests, the browser flow and the screenshots on every push and pull request and uploads the screenshots as an artifact.

To switch Pages on once: Settings, Pages, Source: GitHub Actions.
