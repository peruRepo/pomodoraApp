# Simulate Flow on an iPhone with Expo Go

This guide runs Flow on an iPhone through **Expo Go**. It is the quickest way to
test the app before creating and installing a standalone build.

This workflow does not use Xcode, Apple’s iOS Simulator, EAS Build, or a paid
Apple Developer Program membership. Flow will run only while the development
server on the computer is available.

For a permanent standalone installation, follow
[INSTALL_IPHONE.md](./INSTALL_IPHONE.md).

## Before you begin

You will need:

- An iPhone with the Expo Go app installed from the App Store.
- A computer with Node.js 20.19 or later and npm.
- The iPhone and computer connected to the same Wi-Fi network.

The project uses Expo SDK 54. Expo Go must be able to open SDK 54 projects.

## 1. Install the project dependencies

Clone the repository, then install its dependencies:

```bash
git clone https://github.com/peruRepo/pomodoraApp.git
cd pomodoraApp
npm install
```

Confirm that the SDK 54 dependencies are correct:

```bash
npx expo install --check
npx expo-doctor
```

Continue after Expo reports that the dependencies are up to date and Expo Doctor
passes all checks.

## 2. Start the Expo Go development server

Run:

```bash
npx expo start --clear
```

The `--clear` option removes cached SDK 53 bundles left from before the upgrade.
When Metro starts, Terminal will display a QR code.

Keep this Terminal window open while using Flow in Expo Go.

## 3. Open Flow in Expo Go

1. Unlock the iPhone.
2. Confirm that the iPhone and computer are on the same Wi-Fi network.
3. Open the iPhone Camera app.
4. Scan the QR code displayed in Terminal.
5. Tap the banner that appears.
6. Allow the link to open in Expo Go.
7. Wait for the JavaScript bundle to load.

Flow should now appear inside Expo Go.

## 4. Test Flow

In Expo Go:

1. Allow notifications when prompted.
2. Tap **JSON**.
3. Import or paste a test schedule.
4. Confirm that tasks are sorted and displayed correctly.
5. Start a focus block and confirm that its countdown updates.
6. Put Expo Go in the background.
7. Verify that a scheduled local notification appears.
8. Reopen Expo Go and confirm that the countdown recalculates correctly.

Expo Go is suitable for testing Flow's interface, schedule import, countdown,
local storage, and scheduled local notifications. Always perform a final test
using the standalone build before relying on the app for daily reminders.

## 5. Stop and restart the session

Press **Ctrl+C** in Terminal to stop Metro.

To test again later, run:

```bash
cd /path/to/pomodoraApp
npx expo start
```

Use `npx expo start --clear` again if Expo Go displays an old version of the app
or reports an SDK/cache mismatch.

## Troubleshooting

### Expo Go reports the wrong SDK version

1. Stop Metro with **Ctrl+C**.
2. Confirm the project dependencies:

   ```bash
   npx expo install --check
   npx expo-doctor
   ```

3. Restart with a clean cache:

   ```bash
   npx expo start --clear
   ```

4. Close Expo Go completely on the iPhone, reopen it, and scan the new QR code.

### The QR code does not open the project

- Confirm that both devices are on the same Wi-Fi network.
- Disable a VPN temporarily if it blocks local network access.
- Allow Expo Go to access the local network in
  **Settings > Apps > Expo Go > Local Network**.
- If the network blocks device-to-computer connections, stop Metro and run:

  ```bash
  npx expo start --tunnel
  ```

  Scan the new QR code. Tunnel mode can load more slowly than the normal LAN
  connection.

### Expo Go remains on the loading screen

- Keep the Terminal window running and look for the first error shown there.
- Close and reopen Expo Go.
- Restart Metro with `npx expo start --clear`.
- Confirm that the computer has not gone to sleep.

### Notifications do not appear

1. Open **Settings > Notifications > Expo Go** on the iPhone.
2. Turn on **Allow Notifications**.
3. Enable Lock Screen, Notification Center, Banners, and Sounds.
4. Return to Flow and re-import the schedule.

## Official reference

- [Expo: start developing with Expo Go](https://docs.expo.dev/get-started/start-developing/)
