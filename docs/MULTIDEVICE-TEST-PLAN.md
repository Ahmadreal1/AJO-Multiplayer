# AJO Multi-Device Test Plan (v1.4)

## Automated coverage

`npm run test:multidevice` simulates the core multiplayer lifecycle using the
real repository and session modules:

- Host creates room
- Several players join
- Registration close + round create
- Start voting
- Confirm votes
- Full-number reshuffling after each vote
- Public results
- Incomplete round stays ACTIVE
- Completion only after all registered players vote
- Post-completion vote rejection
- Duplicate vote protection
- Next round with a **different** player count
- Session token reconnect recovery
- Host vs player role separation

## Manual physical-device checklist (required before Android packaging)

Run against a deployed or LAN-hosted server with real phones/browsers:

| # | Scenario | Expected |
|---|----------|----------|
| A | Host creates room | Join code returned + host token |
| B | 3+ devices join | All appear in player list |
| C | Host closes registration | Registration closed; round READY |
| D | Host starts voting | Round ACTIVE; objects visible |
| E | Player selects object | Selection UI updates |
| F | Player changes selection | Previous selection cleared |
| G | Player confirms vote | Number assigned; selected object remains available |
| H | Object persistence | Confirmed object still has a number and remains selectable |
| I | Redistribution | Remaining objects still numbered uniquely |
| J | Public results | Confirmed rows visible to all |
| K | One device does not vote | Round stays ACTIVE |
| L | Early completion attempt | Must not complete early |
| M | Last device votes | Round becomes COMPLETED |
| N | Completion visible | All devices see COMPLETED |
| O | Extra vote attempt | Rejected |
| P | Rejection message | Clear error, no state corruption |
| Q | Host starts next registration | Registration open again |
| R | Different player count joins | New count used for next round |
| S | New round player count | Matches new registration size |
| T | Disconnect + reconnect | Session restored; status preserved |
| U | Duplicate vote | Second confirm rejected |

**Status in this environment:** automated simulation **PASS**.  
Physical multi-device run: **NOT PERFORMED HERE** (requires real devices/network).
