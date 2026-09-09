This directory exists ahead of its code, for the reason `server/unipile/README.md` gives.

What lands here: the availability calculation and the booking write. Unipile has no
free/busy endpoint, so the slots are ours to compute — a padded events query, our own
overlap test, our own working hours in the calendar's own timezone. The three traps that
make a busy day read as free (all-day events with no `date_time`, containment rather than
overlap filtering, unexpanded recurrence) are written out in
`docs/specs/unipile-rooms-and-booking.md` §1.4.
