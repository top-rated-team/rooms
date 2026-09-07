# The bridge

Reserved for the `room-bridge-whatsapp-chatwoot` parcel: contractors answering
from ChatWoot's app on one shared inbox and one WhatsApp number, the client in
WhatsApp with nothing to install, and the client's own Slack and ClickUp
connected to their room.

The directory exists ahead of the code so `scripts/check-parcels.mjs` can tell a
parcel that will create files here from a parcel with a typo in a path. That
check refuses any owned path whose directory is missing, and that strictness is
worth more than the tidiness of an empty folder.

**The whole parcel is attribution.** One number and one inbox carry Dan, every
contractor, and any AI agent either side has added, and WhatsApp shows the
client a single sender for all of them. Every outbound message has to name who
is speaking, taken from the room's member record rather than from whoever typed
it. See `parcels.json` for the rest, including why a bridged agent turn must
claim through `server/spend.ts` like every other one.
