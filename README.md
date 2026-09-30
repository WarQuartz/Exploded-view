# Exploded View

Two-player scenario game for Question Quartney.

## Cloudflare architecture

Exploded View is now Cloudflare-native:

- **Workers Static Assets** serves the mobile UI in `public/`.
- A **Worker** handles the room API.
- One **Durable Object per room code** owns the authoritative two-player state.
- Player answers stay server-side and hidden until both players commit.
- Durable Object storage preserves room state beyond an individual Worker isolate.
- `scenarios.json` remains the scenario source for this MVP.

## Local development

```bash
npm install
npm run dev
```

## Cloudflare deployment

Connect the GitHub repository **WarQuartz/Exploded-view** to Cloudflare Workers Builds.

Build command:

```
npm install
```

Deploy command:

```
npx wrangler deploy
```

The first deployment applies the `v1` Durable Object migration in `wrangler.toml`.

## Game flow

Host creates a five-character room code → Player 2 joins → both answer secretly → Gerald drops the complication → both answer again → answers reveal → host starts the next round.

## Next build targets

1. Multi-round session summary.
2. Free-response answers.
3. Chaos Cards.
4. Anonymous aggregate analytics.
5. Question Quartney/Wix entry point.
