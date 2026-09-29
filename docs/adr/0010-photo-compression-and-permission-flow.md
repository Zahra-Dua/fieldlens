# ADR 0010: Photo compression size ceiling and permission flow

**Date:** 2026-09-29
**Status:** accepted

## Context

Day 7 says photos have to be compressed before they're stored, because a full-resolution photo would eat the sync budget the offline sync engine depends on (Day 10). The spec also wants a documented size ceiling, not just "I compressed it."

There are also two permission flows to get right: camera (required, the screen is useless without it) and GPS (optional metadata, should never block saving a photo if the user says no).

## Options considered

**Compression**
1. Just lower the JPEG quality, keep the original resolution. Simple, but most of the file size on a modern phone camera comes from resolution, not compression artefacts, so this barely helps.
2. Resize to a fixed max dimension and lower the quality a bit. Two knobs, but they're the two that actually matter for size.
3. Resize very aggressively (small dimension) for the smallest possible files. Would sync faster but risks the photo being too small to actually tell what's in it, on review or later when training the model.

**Permissions**
1. Ask for camera and GPS together, automatically, when the screen opens. Fewer dialogs, but if the user isn't ready for the GPS prompt and taps "deny" out of reflex, they can't even use the camera. Also, a dialog the user didn't consciously trigger counts as a real denial to the OS.
2. Ask for camera only from a button tap, and ask for GPS separately, only when the user actually presses "Use photo." Denying GPS at that point should never stop the photo from saving.

## Decision

**Compression:** resize so the longest side is at most 1280px, JPEG quality 80, no EXIF kept. On my test photos (mid-range Android phone) this comes out around 90-100KB, well under the 300KB ceiling I'm setting for this.

**Permissions:** camera permission only gets requested when the user taps "Allow camera access," never automatically on screen load. GPS permission is asked separately, only when "Use photo" is pressed, and saying no there just leaves latitude/longitude empty — it doesn't block the save.

## Rationale

**Why 1280px / quality 80 and not smaller:** this is a waste-sorting app, so the photo still needs to be clear enough to tell plastic from glass, both for the field worker reviewing it later and for training the model in Segment 3. 1280px keeps that readable while staying way under budget. If Day 10's real sync test shows this is still too slow on a bad connection, that's the number to change, not the whole approach.

**Why camera permission waits for a button tap:** Android/iOS only give you the "free" system dialog once per install if you haven't asked before. If I call the request automatically the second the screen loads, a brand new user who hasn't even seen the app yet gets hit with a permission popup out of nowhere. If they reflexively tap "Deny," that's now a real, counted denial — next time I ask, the OS might just skip straight to "permanently denied" instead of showing the dialog again. Putting the request behind a visible button means the user only sees the dialog after they've already decided to proceed, so a "no" is an actual decision, not an accident.

**Why GPS can't block the photo from saving:** the spec is explicit that GPS is optional. If I tied it to the same flow as the camera, or made a GPS decline stop the save, that breaks the "optional" part and would annoy anyone who doesn't want to share their location on every single inspection.

## Consequences

- Easier: I know roughly how big every upload will be, so the sync engine has a predictable budget to work with. Users also aren't ambushed by a permission dialog before they understand why the app wants it.
- Harder: latitude and longitude can be missing independently of whether the photo itself saved fine, so anything that reads InspectionMetadata later has to handle that instead of assuming location is always there.
- Locked in: 1280px and quality 80 as the defaults. Changing them later is a one-line edit in FlutterImageCompressor, not a bigger change.

**Would make me revisit this:** if the Day 15 benchmark shows sync is still too slow at this size on a realistic connection, or if training the model in Segment 3 shows 1280px is losing detail that actually matters for accuracy.
