# Install Flow on an iPhone

This guide installs Flow directly from a Mac using Xcode and a free Apple
Account. It covers:

1. The first installation over USB.
2. One-time wireless pairing.
3. Automatic refreshes over Wi-Fi before Apple's seven-day Personal Team
   provisioning expires.

To test Flow without installing a standalone app, follow
[SIMULATE_IPHONE.md](./SIMULATE_IPHONE.md) and use Expo Go.

## Understand the seven-day limit

With a free Apple Account, Xcode identifies your account as a **Personal Team**.
The provisioning profile used to run Flow expires seven days after it is issued.
Flow must be rebuilt, re-signed, and installed again before or after expiration.

The automatic refresh in this guide:

- Checks twice per day.
- Refreshes only when five days have passed since the last successful install.
- Retries at the next check if the Mac or iPhone was unavailable.
- Installs over the existing Flow app using the same bundle identifier,
  `com.ayyam.flowpomodoro`.

Do not delete Flow before a refresh. Installing over the existing app normally
preserves its saved JSON. Use **Export the full plan** periodically as a backup.

Automation is best-effort rather than guaranteed. Apple or Xcode may occasionally
require you to unlock the phone, accept a prompt, or sign in again.

## Before you begin

You will need:

- A Mac with Xcode installed.
- An iPhone running iOS 16 or later.
- A USB cable for the first installation and wireless pairing.
- Node.js 20.19 or later and npm.
- A free Apple Account signed in to Xcode.
- The Mac and iPhone on the same local Wi-Fi network for wireless refreshes.

## 1. Install and configure Xcode

1. Install Xcode from the Mac App Store.
2. Open Xcode and allow it to install additional components.
3. Open **Xcode > Settings > Locations**.
4. Select the installed Xcode version under **Command Line Tools**.
5. Open **Xcode > Settings > Accounts**.
6. Press **+** and sign in with your Apple Account.
7. Confirm that Xcode shows a **Personal Team** for the account.

In Terminal, make the full Xcode installation active:

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

## 2. Prepare the project

Run:

```bash
git clone https://github.com/peruRepo/pomodoraApp.git
cd pomodoraApp
npm install
npx expo install --check
npx expo-doctor
```

Continue after Expo reports that the dependencies are current and Expo Doctor
passes all checks.

## 3. Prepare and pair the iPhone over USB

1. Connect the iPhone to the Mac with USB.
2. Unlock the iPhone.
3. Tap **Trust This Computer** if prompted.
4. Enter the iPhone passcode.
5. Enable **Settings > Privacy & Security > Developer Mode** on the iPhone.
6. Restart the iPhone if requested and confirm **Turn On** after restart.
7. In Xcode, open **Window > Devices and Simulators**. In newer Xcode versions,
   open **Xcode > Open Developer Tool > Device Hub**.
8. Select the iPhone and wait until Xcode finishes preparing it.
9. Enable **Connect via network** if that option is displayed.

Keep the cable connected for the first installation.

## 4. Create the first release build and install it

From the project directory, run:

```bash
npx expo run:ios --configuration Release --device
```

Select the connected iPhone when Expo asks. Expo generates the native `ios`
project, compiles Flow, signs it, installs it, and opens it on the phone. The
Release configuration embeds the JavaScript bundle, so Flow can run without
Metro after installation.

If signing cannot select the Personal Team:

1. Run `xed ios` from the project directory.
2. Select the **Flow** project in Xcode.
3. Select the **Flow** target.
4. Open **Signing & Capabilities**.
5. Enable **Automatically manage signing**.
6. Select your **Personal Team**.
7. Confirm the bundle identifier is `com.ayyam.flowpomodoro`.
8. Press **Run**, or rerun the Expo command above.

When Flow opens:

1. Allow notifications.
2. Import the schedule JSON.
3. Confirm that tasks appear and a local notification can be scheduled.
4. Use **Export the full plan** and save a backup copy.

## 5. Confirm wireless installation

After the USB installation succeeds:

1. Disconnect the USB cable.
2. Keep the Mac and iPhone on the same Wi-Fi network.
3. Keep the iPhone unlocked for this test.
4. Open Xcode's **Devices and Simulators** or **Device Hub**.
5. Confirm that the iPhone appears as an available wireless device.
6. In Terminal, list the devices and record the exact iPhone name or identifier:

   ```bash
   xcrun devicectl list devices
   ```

7. Test one wireless reinstall, replacing the example device name:

   ```bash
   cd /path/to/pomodoraApp
   npx expo run:ios --configuration Release \
     --device "My iPhone" \
     --no-bundler
   ```

Do not continue to automation until this wireless command succeeds. If it does
not, reconnect USB, reopen Device Hub, and repeat the pairing steps.

## 6. Configure the automatic five-day refresh

The repository includes:

- `scripts/refresh-iphone.sh`, which checks the last successful refresh and
  performs a release reinstall when five days have passed.
- `scripts/launchd/com.ayyam.flowpomodoro.refresh.plist.example`, which asks macOS to run
  the check every 12 hours.

The scripts intentionally leave `PROJECT_DIR` empty. Provide the absolute path
to your cloned project through that environment variable whenever you run a
script manually. The LaunchAgent template sets it after you replace
`REPLACE_WITH_PROJECT_DIR`.

### 6.1 Add the iPhone name or identifier

Open the LaunchAgent template:

```bash
open -e scripts/launchd/com.ayyam.flowpomodoro.refresh.plist.example
```

Replace both placeholders:

```text
REPLACE_WITH_IPHONE_NAME_OR_ID
REPLACE_WITH_PROJECT_DIR
```

Use the exact device name or identifier from `xcrun devicectl list devices` and
the absolute path printed by `pwd`, respectively. Save the file.

### 6.2 Install the LaunchAgent

Run:

```bash
mkdir -p "$HOME/Library/LaunchAgents"
cp \
  "scripts/launchd/com.ayyam.flowpomodoro.refresh.plist.example" \
  "$HOME/Library/LaunchAgents/com.ayyam.flowpomodoro.refresh.plist"
plutil -lint \
  "$HOME/Library/LaunchAgents/com.ayyam.flowpomodoro.refresh.plist"
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.ayyam.flowpomodoro.refresh.plist"
```

If macOS says the service is already loaded, unload the old copy and load it
again:

```bash
launchctl bootout "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.ayyam.flowpomodoro.refresh.plist"
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.ayyam.flowpomodoro.refresh.plist"
```

### 6.3 Record the successful first installation

The refresh script uses a timestamp file to avoid rebuilding too early. After
the first USB or wireless installation succeeds, run:

```bash
mkdir -p .expo
touch .expo/last-iphone-refresh
```

The automatic job will become eligible to refresh five days after this
timestamp.

### 6.4 Test the automatic job

Confirm that launchd can start it:

```bash
launchctl kickstart -k \
  "gui/$(id -u)/com.ayyam.flowpomodoro.refresh"
```

Because the first installation was just recorded, the log should say that a
refresh is not due:

```bash
tail -n 50 \
  ".expo/iphone-refresh.log"
```

To test a real reinstall immediately, run the script with `--force` and the
exact device name or identifier:

```bash
PROJECT_DIR="/absolute/path/to/pomodoraApp" /bin/zsh \
  "scripts/refresh-iphone.sh" \
  "My iPhone" \
  --force
```

Keep the iPhone unlocked and on the same Wi-Fi network during this test.

## How the automatic refresh behaves

Every 12 hours, while you are logged in to the Mac, launchd starts the script.
The script:

1. Stops immediately if fewer than five days have passed since success.
2. Checks that Xcode, project dependencies, and the generated iOS project exist.
3. Attempts a signed Release build and wireless installation.
4. Updates the success timestamp only after the install succeeds.
5. Leaves the timestamp unchanged after a failure, causing another attempt at
   the next 12-hour check.

For the refresh to succeed:

- The Mac must be awake and logged in.
- The iPhone must be powered on, reachable, and preferably unlocked.
- Both devices must be on the same local network.
- VPN, guest Wi-Fi, or firewall rules must not block Xcode device discovery.
- Xcode's Apple Account session and Personal Team signing must remain valid.

The log is stored at:

```text
.expo/iphone-refresh.log
```

## Manually refresh at any time

If automation fails or the profile has already expired, unlock the iPhone and
run:

```bash
PROJECT_DIR="/absolute/path/to/pomodoraApp" /bin/zsh \
  "scripts/refresh-iphone.sh" \
  "My iPhone" \
  --force
```

Reconnect USB if Xcode cannot find the phone wirelessly. Do not delete Flow
before reinstalling; an in-place reinstall normally preserves its stored JSON.

## Optional alternative: Apple Developer Program

Apple offers the paid Apple Developer Program for **US$99 per year**. It avoids
the free Personal Team's weekly reprovisioning workflow and enables longer-lived
distribution options such as internal ad hoc builds and TestFlight. This guide
does not cover that setup further.

## Troubleshooting

### The log says the iPhone is unavailable

- Unlock and wake the iPhone.
- Confirm both devices are on the same Wi-Fi.
- Disable VPN temporarily.
- Check the iPhone in Xcode's Device Hub.
- Reconnect USB once to restore pairing.
- Run the forced manual refresh again.

### Xcode requests the Apple Account again

Open **Xcode > Settings > Accounts**, sign in again, and confirm that the Flow
target still uses the same Personal Team. Then force a manual refresh.

### Flow installs but the JSON is missing

The refresh command uses the same bundle identifier and should install over the
existing app. Data can be lost if Flow was deleted, the bundle identifier or
signing team changed, or iOS treated the build as a different application.
Import the most recent JSON backup.

### The automatic job is not running

Check its status:

```bash
launchctl print "gui/$(id -u)/com.ayyam.flowpomodoro.refresh"
```

Validate the installed configuration:

```bash
plutil -lint \
  "$HOME/Library/LaunchAgents/com.ayyam.flowpomodoro.refresh.plist"
```

After editing the plist, use `launchctl bootout` and `launchctl bootstrap` again.

### Remove the automatic refresh

Unload it:

```bash
launchctl bootout "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.ayyam.flowpomodoro.refresh.plist"
```

Then move the plist out of `~/Library/LaunchAgents`.

## Official references

- [Apple: free Personal Team limits](https://developer.apple.com/help/account/basics/about-your-developer-account)
- [Apple: Xcode Device Hub](https://developer.apple.com/documentation/xcode/device-hub/)
- [Apple: Xcode command-line tools](https://developer.apple.com/documentation/xcode/xcode-command-line-tool-reference)
- [Expo CLI: local iOS builds](https://docs.expo.dev/more/expo-cli/)
- [Apple Developer Program](https://developer.apple.com/get-started/)
