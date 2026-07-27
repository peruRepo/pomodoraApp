# Flow Pomodoro

An iPhone-first, JSON-driven Pomodoro scheduler built with Expo and React Native.

## Run

```bash
npm install
npm run ios
```

To test the app on an iPhone without creating a build, use Expo Go and follow
[SIMULATE_IPHONE.md](./SIMULATE_IPHONE.md).

To install Flow on an iPhone with free Personal Team signing and configure its
automatic five-day wireless refresh, follow
[INSTALL_IPHONE.md](./INSTALL_IPHONE.md).

## JSON format

`startAt` must be an ISO-8601 timestamp with an explicit UTC offset. The app sorts
tasks across days and warns when a task overlaps the next task's required gap.

```json
{
  "schemaVersion": 1,
  "timezone": "America/Chicago",
  "generatedAt": "2026-07-25T12:00:00-05:00",
  "tasks": [
    {
      "id": "physics-1",
      "title": "Physics problem set",
      "startAt": "2026-07-26T09:00:00-05:00",
      "durationMinutes": 50,
      "gapAfterMinutes": 10,
      "project": "Study",
      "notes": "Problems 1–8",
      "status": "scheduled"
    }
  ]
}
```

Valid statuses are `scheduled`, `active`, `completed`, `deferred`, `cancelled`,
and `missed`. Unknown or omitted statuses become `scheduled`.

## Background behavior

Flow stores absolute start/end times and schedules local iOS notifications. It
does not run a one-second background timer, avoiding unnecessary battery use.
When reopened, the countdown is recalculated from the clock.

Dynamic Island and Lock Screen Live Activities require an iOS Widget Extension
and are intentionally left for the native build phase after the scheduling flow
is validated.
