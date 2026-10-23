# Evidence 009 — M1 Task 8: a zone drawn in the app is saved on the server (AC-2)

- Date: 2026-10-23
- Server: Traccar 6.16.0, live H2 lab at `http://127.0.0.1:8082/api` (the same instance M0 provisioned).
- Path under test: the **shipped** service (`src/services/traccar/zones.ts` + `permissions.ts` over
  `src/services/traccar/client.ts`), signed in with `signIn()` — no hand-written HTTP for the product path.
- Credentials: read from `lab/traccar/fanout.env` into the process environment. The password never appears
  in an argument list, a log, or this file. Ids only; no emails, names, or tokens are quoted.
- Numbering: the plan's step 6 asked for `008-m1-ac2-zone-on-server.md`, but **008 is already taken** by
  `008-form-encoding-and-token-route.md`. This artifact is therefore **009**, and the two plan references
  were corrected in the same change. (Ruling recorded in the ledger.)

## 1. Routes (measured before writing them into the service)

Raw lines from `lab/logs/route-probe-20261023-202401.log`:

```
create-for-verbs POST /geofences -> HTTP 200
update-collection PUT /geofences -> HTTP 405 body=jakarta.ws.rs.NotAllowedException: HTTP 405 Method Not Allowed ...
update-by-id PUT /geofences/33 -> HTTP 200
read-back-after-put GET /geofences?id=33 -> HTTP 200
stored-name-after-put="lab-probe-verbs-renamed-1792783442218"
delete-by-query DELETE /geofences?id=33 -> HTTP 405 body=jakarta.ws.rs.NotAllowedException: HTTP 405 Method Not Allowed ...
read-after-query-delete GET /geofences?id=33 -> HTTP 200
survived-query-delete=true
delete-by-id DELETE /geofences/33 -> HTTP 204
create-polygon POST /geofences -> HTTP 200
read-polygon GET /geofences?id=34 -> HTTP 200
stored-polygon-area="POLYGON((36.7538 3.0588, 36.7548 3.0588, 36.7548 3.0598, 36.7538 3.0588))"
polygon-area-roundtrip-identical=true
delete-polygon DELETE /geofences/34 -> HTTP 204
create-route-zero POST /geofences -> HTTP 200
read-route-zero GET /geofences?id=35 -> HTTP 200
stored-route-area="LINESTRING (36.7538 3.0588, 36.7548 3.0598)"
stored-route-attributes={"polylineDistance":0}
polylineDistance-present=true value=0 type=number
delete-route-zero DELETE /geofences/35 -> HTTP 204
create-route-buffered POST /geofences -> HTTP 200
read-route-buffered GET /geofences?id=36 -> HTTP 200
stored-buffered-attributes={"polylineDistance":150}
delete-route-buffered DELETE /geofences/36 -> HTTP 204
```

**R-M1-13 answers, both positive:**

1. **`POLYGON((…))` with no space after the name is accepted.** The server stored our exact bytes and
   returned them byte-identically (`polygon-area-roundtrip-identical=true`). Traccar's own writer uses
   `POLYGON ((…))` with a space, so `parseWkt` accepts both spellings — no rewrite of `toPolygonWkt`.
2. **An explicit `polylineDistance: 0` is stored as the number 0**, not dropped in favour of the default
   25 (`polylineDistance-present=true value=0 type=number`).

The route shape also follows from the first block: updates must target `/{id}` (`PUT` on the collection is
405, and `DELETE ?id=` is 405 with the row surviving; only `/{id}` answers 204).

## 2. `GET /api/permissions` is key-ORDER-semantic (found while making AC-2 actually link)

Raw lines from `lab/logs/perm-order-20261023.log`, all through the shipped client (order preserved):

```
ids: userId=2 deviceId=1 geofenceId=38 notificationId=1
userId-first/notification ?userId=2&notificationId=0 -> HTTP 200 count=1 keys=USERID,NOTIFICATIONID
notificationId-first/user ?notificationId=0&userId=2 -> HTTP 400 kind=server message=HTTP 400
userId-first/geofence ?userId=0&geofenceId=38 -> HTTP 200 count=1 keys=USERID,GEOFENCEID
geofenceId-first/user ?geofenceId=38&userId=0 -> HTTP 400 kind=server message=HTTP 400
deviceId-first/geofence ?deviceId=0&geofenceId=38 -> HTTP 200 count=1 keys=DEVICEID,GEOFENCEID
geofenceId-first/device ?geofenceId=38&deviceId=0 -> HTTP 400 kind=server message=HTTP 400
deviceId-first/notification ?deviceId=1&notificationId=0 -> HTTP 200 count=1 keys=DEVICEID,NOTIFICATIONID
notificationId-first/device ?notificationId=0&deviceId=1 -> HTTP 400 kind=server message=HTTP 400
single-key ?userId=2 -> HTTP 400 kind=server message=HTTP 400
```

The same file, second measurement of the 400 bodies (Basic header read from env, nothing printed):

```
notificationId-first/user ?notificationId=0&userId=2 -> HTTP 400 :: ... Table "TC_NOTIFICATION_USER" not found; SQL statement:
geofenceId-first/user ?geofenceId=38&userId=0 -> HTTP 400 :: ... Table "TC_GEOFENCE_USER" not found; SQL statement:
geofenceId-first/device ?geofenceId=38&deviceId=0 -> HTTP 400 :: ... Table "TC_GEOFENCE_DEVICE" not found; SQL statement:
notificationId-first/device ?notificationId=0&deviceId=1 -> HTTP 400 :: ... Table "TC_NOTIFICATION_DEVICE" not found; SQL statement:
single-key ?userId=2 -> HTTP 400 :: java.lang.ArrayIndexOutOfBoundsException: Index 1 out of bounds for length 1
```

**Rule:** the **first key names the relation table**; the second key's value `0` means "unfiltered". A client
helper that sorts query keys alphabetically turns a working read into a 400 — which is exactly what had
happened (`client.ts` sorted before Task 8). The sort is removed and a test pins caller order.

The live rows also carry **UPPERCASE** columns (`USERID,NOTIFICATIONID`, …), so `rowId` reads `row[key] ??
row[key.toUpperCase()]`.

## 3. AC-2 end-to-end through the shipped service

### 3.1 A fresh create in one run (create → four links → read back)

`lab/logs/ac2-fresh-20261023.log` (one process, one sign-in, zone created by `createZone()`):

```
created: geofence 41 "lab-zone-m1-fresh-1792788435547" area=CIRCLE (36.7538 3.0588, 90)
permission user->device present=true
permission device->geofence present=true
permission device->notification present=true
permission user->notification present=true
```

The area printed is the server's own `area` field, read back by `listZones()` after the write — not the
draft we sent. The radius is the drawn 90 m and the pair is `lat lon`.

### 3.2 The named acceptance zone, re-read later (persistence)

`lab/logs/ac2-save-20261023.log`:

```
sign-in: id=1 admin=true (identity is the User POST /session returned)
device-id=1 guardian2=id=2
existing: geofence 38 "lab-zone-m1-1" area="CIRCLE (36.7538 3.0588, 90)"
reused: the zone already carries its device link from a completed run
permission user->device present=true
permission device->geofence present=true
permission device->notification present=true
permission user->notification present=true
AC2-LINE geofence 38 "lab-zone-m1-1" area=CIRCLE (36.7538 3.0588, 90)
```

### 3.3 The independent tool (not our service)

`lab/logs/ac2-probe.log` (the `api-probe.mjs` run that follows the save; it prints what the server lists):

```
geofence 38 "lab-zone-m1-1" area=CIRCLE (36.7538 3.0588, 90)
...
== ensure-web-notificator == already present, no change
...
== token revoke == HTTP 204
```

That line is the literal expected string from the plan, produced by the probe rather than by the code
under test — the zone exists on the server with exactly the drawn geometry.

The same tool, re-run after §3.1, lists the fresh zone independently (`lab/logs/ac2-probe-20261023-final.log`):

```
26:geofence 38 "lab-zone-m1-1" area=CIRCLE (36.7538 3.0588, 90)
29:geofence 41 "lab-zone-m1-fresh-1792788435547" area=CIRCLE (36.7538 3.0588, 90)
...
45:== ensure-web-notificator == already present, no change
64:== token revoke == HTTP 204
```

## 4. Identity: the live User names the admin bit `administrator`

`lab/logs/ac2-probe.log:47` (the full field list `POST /session` returned) contains `administrator` and
does **not** contain `admin`; `ac2-save` prints `admin=true` only because `session.ts` maps the live name:

```ts
if (typeof source.administrator === 'boolean') user.admin = source.administrator;
```

Pinned by `tests/app/session.test.ts` and mutation M6 (reading `source.admin` reddens it).

## 5. What this evidence does NOT prove

- **The browser drawing gesture (plan Step 5, "draw with the mouse") is NOT RUN** (R-M1-19). The saved
  geometry above came from the shipped service with the drawing screen's exact draft shape; the pointer
  gesture itself has no screen recording.
- **`Object.keys(localStorage)` after a save is NOT RUN** in a browser. What is proven instead: a
  `globalThis.localStorage` spy records zero calls across `createZone`, the App wiring test asserts the
  local zone key is never read or written, and the dashboard touches no browser storage.
- No phone screenshot is attached to this evidence; nothing here was taken from a device.
