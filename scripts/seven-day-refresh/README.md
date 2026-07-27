# Manual seven-day refresh

Keep the Mac and iPhone on the same Wi-Fi, unlock the iPhone, and run:

```bash
./scripts/seven-day-refresh/refresh-pomodoro.sh "My iPhone"
```

The script stops without building if Xcode cannot reach the paired iPhone over
the local network. When the check passes, it builds the Release app, renews its
personal-team signature, and installs it over the existing Pomodoro app.
