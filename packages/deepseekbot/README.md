# deepseekbot

The BotHarness bundle: installs `@botharness/core` and `@botharness/ui` as one profile layer (`dsh.bundle.patch`).

Package publication is not set up yet (`private: true`); for the local dev profile install the three packages from the checkout:

```sh
dsh plugin --profile <p> add ./packages/core
dsh plugin --profile <p> add ./packages/client
dsh plugin --profile <p> add ./packages/deepseekbot
```

The bundle patch references the sibling packages by name, so install `core` and `client` first.
See `docs/client-bridge.md` §7 for the full dev loop (rebuild `lib/client.js`, HMR picks it up).
