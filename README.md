# Exploded View — Room MVP

A no-dependency Node.js two-player web game for Question Quartney.

## What works
- Host creates a room with a 5-character code.
- Player 2 joins from a separate phone/browser.
- Both see the same scenario.
- Initial answers stay hidden until both lock.
- Gerald drops the complication.
- Both re-answer.
- Answers are revealed only after both commit.
- Host advances to the next round.
- 15 scenarios are loaded from the authored Scenario Library.

## Run locally
Requires Node 18+.

```bash
node server.js
```

Open `http://localhost:3000` on two browser windows/devices.

## Deployment
The app respects the `PORT` environment variable, so it is ready for a standard Node web service.

## MVP storage warning
Rooms live in server memory. A restart/deploy clears active rooms. That is intentional for this stage.
The next persistence layer should store sessions/answers without putting authoring content and player data in the same table.

## Next build targets
1. Session summary across multiple rounds.
2. Free-response / "write your own" answer.
3. Chaos Cards.
4. Persistent session store.
5. Anonymous aggregate analytics.
6. Question Quartney/Wix entry point.
