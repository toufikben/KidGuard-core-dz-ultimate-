# Evidence 011 — M1 phone browser check (Task 11 Step 5 / Task 12)

- Date: 2026-10-24
- Status: **NOT RUN**

## What was required

Open the app in the **phone's browser** at `http://127.0.0.1:3000` through `adb reverse`, sign in with
the lab credentials, and capture before/after screenshots of each screen into `lab/artifacts/` (not
committed), with their MD5 in this artifact; no full device serial, no real child name
(`docs/superpowers/plans/2026-10-08-M1-guardian-app.md`, Task 11 Step 5).

## Why it is NOT RUN

- Signing in requires the lab credentials to be **typed into the phone by the operator**. The standing
  security rule forbids putting a password into any command line, file, or automated input, and there
  was no operator session available to type it manually. No credential was automated onto the device.
- Consequently **no screenshot exists** for this check, and none is claimed. A screenshot of a signed-out
  screen would not be evidence for any M1 screen, so none was taken.

## What was measured on the phone instead

The phone participated in the two live measurements through the same USB tunnel, but **not through a
browser**:

- **AC-1** — positions injected from inside the phone over `adb reverse tcp:5055`, read back through the
  shipped client (`012-m1-ac1-transport.md`).
- **AC-3** — the inside/outside pair for the school circle injected the same way, with two guardians
  receiving the event over the `web` channel (`010-m1-ac3-web-fanout.md`).

Those prove the USB path, the ingest, and the app's client code; they do **not** prove rendering,
navigation, RTL layout, tapping, or any browser-only behaviour on the device.

## Cleanup (measured)

```text
$ "$ADB" reverse --remove-all
$ "$ADB" reverse --list
(empty output)

$ netstat -ano | grep -E ':(8082|5055|5199|3000)' | grep LISTENING || echo "ALL LAB PORTS CLOSED"
ALL LAB PORTS CLOSED
```

The Traccar process (PID 2584, `java.exe` from JDK 25) was stopped after the measurements; `curl` to
`http://127.0.0.1:8082/api/server` returns `000` (no listener).

## What would close it

With the lab running: `adb reverse tcp:3000 tcp:3000` and `adb reverse tcp:8082 tcp:8082`, then the
operator opens `http://127.0.0.1:3000` on the phone and signs in manually. Screenshots go to
`lab/artifacts/`, their MD5 into this file, and the tunnel is removed with `adb reverse --remove-all`.
Until that happens this artifact stays **NOT RUN** and no screen is claimed as verified on the device.
