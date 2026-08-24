# AJO v0.8 Release Readiness

## Verified locally
- Core voting-rule tests pass.
- Multi-player round lifecycle simulation passes.
- A round completes only when the registered player count has voted.
- A completed round rejects further votes.
- A new round can reopen registration.
- The next round's player count is calculated from the new registered-player count.

## Still requires real infrastructure
- Managed PostgreSQL connection
- HTTPS deployment
- Real authenticated sessions
- Real multi-device testing
- Production monitoring/logging
- Secure image hosting
- Android build environment
- Release APK/AAB signing

This milestone deliberately does not claim any cloud service, database, domain, or Android signing key
has been connected.