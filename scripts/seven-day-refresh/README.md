# Manual seven-day refresh

`PROJECT_DIR` is intentionally empty by default. Set it to the absolute path of
your cloned project when running the script. Keep the Mac and iPhone on the same
Wi-Fi, unlock the iPhone, and run:

```bash
PROJECT_DIR="/absolute/path/to/pomodoraApp" \
  ./scripts/seven-day-refresh/refresh-pomodoro.sh "My iPhone"
```

The script stops without building if Xcode cannot reach the paired iPhone over
the local network. When the check passes, it builds the Release app, renews its
personal-team signature, and installs it over the existing Pomodoro app.
