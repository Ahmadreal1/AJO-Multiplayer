# Android APK Build Plan

1. Keep the multiplayer server as the authoritative backend.
2. Package the AJO web client inside an Android shell (WebView/Capacitor-style approach).
3. Configure HTTPS backend URL.
4. Add app icon, splash screen, app name `AJO`.
5. Test:
   - create room
   - join from multiple devices
   - close registration
   - start voting
   - Change Selection
   - Confirm Vote
   - EMPTY behavior
   - completion only after all registered players vote
   - next round with a different player count
   - reconnect
   - public results
   - Download Record
6. Build a release APK/AAB.
7. Sign the release artifact with the developer's private Android signing key.
8. Keep the signing key private and backed up securely.
