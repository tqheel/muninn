# Instructions for agents working in this repo

Before every commit:

1. Run `npm test` and make sure it passes. Do not commit with failing tests.
2. Add an entry to `CHANGELOG.md` under `[Unreleased]`, grouped by change and written for a person who uses muninn, not as a list of files. Group entries under a heading for the commit once its hash is known, or under `Added`, `Changed` or `Fixed` before then.
3. Update `README.md` if the behavior, setup or settings changed.

Other rules:

- Do not push unless the owner says so.
- No build step and no npm dependencies. Plain ES modules.
- Never commit `.env`, credentials, audio clips, or anything about the owner's family or purchases.
- `README.md` is in the owner's first-person voice and uses no em dashes.
- When testing, stop servers you started by PID. Never use `pkill -f "muninn.js serve"`, which would kill the owner's own instance.
