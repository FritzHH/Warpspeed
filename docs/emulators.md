# Local Firebase Emulator Suite

For dev sessions that don't need real production data, use the local emulator.
Zero Firestore read charges. Much faster. Safe to break things.

## Usage — two-terminal flow

1. Terminal 1: `yarn emulators`
   - Starts the local emulators (Firestore, Auth, Functions, Storage, Database)
   - Emulator UI at http://localhost:4000
2. Terminal 2: `yarn start:emulator`
   - Starts the Vite dev server with `VITE_USE_EMULATORS=true`
   - App connects to local emulators
3. App displays an orange "EMULATOR" badge in the corner so you know which mode you're in.

## Switching back to real Firebase

Just run `yarn start` instead of `yarn start:emulator`. No file editing required.
The emulator badge disappears. The app connects to real Firebase as usual.

## Persisting emulator data

Emulator state is saved to `.emulator-data/` when you stop the emulator
(via `--export-on-exit`). Next time you run `yarn emulators`, it imports
from there. Run `yarn emulators:fresh` to start from a clean slate instead.

## Production builds

`yarn build` always produces a production-ready bundle that connects to real
Firebase. The emulator code paths only activate when `VITE_USE_EMULATORS=true`
AND the build is in dev mode (`import.meta.env.DEV`).

## Seeding the emulator with real data (one-time)

If you want to dev against a copy of real shop data instead of an empty
database, export production data once:

    firebase firestore:export gs://<bucket>/dev-snapshot --project shop

Download that export and import it on emulator startup:

    firebase emulators:start --import=./path/to/exported/data

Adjust the `yarn emulators` script if you want the seed to load automatically.

## Ports

| Service   | Port |
|-----------|------|
| Auth      | 9099 |
| Firestore | 8080 |
| Functions | 5001 |
| Storage   | 9199 |
| Database  | 9000 |
| Emulator UI | 4000 |
