# GPS Freshness Fix

## Implementation
A new `GpsFreshnessService` protects the evaluation boundary before `GeofenceMonitor` and `RiskEngine` mutate state. It accepts fixes no older than 90 seconds, rejects fixes older than the last accepted timestamp, and rejects timestamps more than 5 seconds in the future. Rejected fixes cannot open or resolve incidents, mutate geofence counters, or trigger the siren.

## Tests
Added coverage for a recent accepted fix, equal-timestamp idempotency, out-of-order fixes, stale fixes beyond 90 seconds, and implausible future timestamps.

## Verification
`npm test`: passed. `npm run lint` / TypeScript: passed. `npm run build`: passed with the existing non-blocking Vite chunk-size warning. Android `assembleDebug`: passed.

## Delivery
`KidGuard-debug-gps-freshness.apk` is a local Debug APK for device testing. No GitHub push was performed.

## Note
The guard is placed at the application evaluation boundary, so both `GeofenceMonitor` and `RiskEngine` are protected during real app operation. Direct unit callers of `RiskEngine.assessRisk()` remain a pure calculation API and are covered separately by existing tests.
