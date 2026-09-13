import type { AdminPeopleResponse, AdminPerson, AdminPersonBooking, AdminPersonRoom, AdminSignInMethod } from "@shared/api";

import { HEADING, LINK, META, META_PLAIN, READ, READ_MUTED } from "@/components/site/doors/quiet";

function methodLabel(method: AdminSignInMethod): string {
  if (method === "linkedin") return "LinkedIn";
  if (method === "whatsapp") return "WhatsApp";
  return "Email";
}

function offeredLine(offered: AdminPeopleResponse["offeredSignIn"]): string {
  const names: string[] = [];
  if (offered.linkedin) names.push("LinkedIn");
  if (offered.whatsapp) names.push("WhatsApp");
  if (offered.email) names.push("email");
  if (names.length === 0) return "This deployment has no sign-in method configured.";
  if (names.length === 1) return `This deployment offers sign-in with ${names[0]}.`;
  if (names.length === 2) return `This deployment offers sign-in with ${names[0]} and ${names[1]}.`;
  return `This deployment offers sign-in with ${names[0]}, ${names[1]} and ${names[2]}.`;
}

function formatWhen(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RoomRow({ room }: { room: AdminPersonRoom }) {
  const opened = formatWhen(room.openedAt);
  const lastActive = formatWhen(room.lastActiveAt);
  return (
    <li className="border-t border-border py-[var(--s2)] first:border-t-0">
      <a href={`/w/${room.token}`} className={LINK} data-testid={`link-admin-room-${room.token}`}>
        {room.name || "A room"}
      </a>
      <p className={`${META_PLAIN} mt-[var(--s1)]`}>
        {opened ? `Opened ${opened}.` : null}
        {opened ? " " : null}
        {lastActive
          ? `Last active ${lastActive}.`
          : "Last active is not on the room record this page can read."}
      </p>
    </li>
  );
}

function BookingRow({ booking }: { booking: AdminPersonBooking }) {
  const when = formatWhen(booking.startsAt);
  return (
    <li className="border-t border-border py-[var(--s2)] first:border-t-0">
      <p className={READ}>
        {booking.topic}
        {when ? ` · ${when}` : ""}
        {booking.timezone ? ` · ${booking.timezone}` : ""}
      </p>
      <p className={META_PLAIN}>{booking.stands ? "Stands." : "Cancelled."}</p>
    </li>
  );
}

function Person({ person }: { person: AdminPerson }) {
  return (
    <article className="border-t border-border py-[var(--s4)] first:border-t-0" data-testid={`admin-person-${person.id}`}>
      <h2 className={`${HEADING} m-0`}>{person.displayName || "A person with no display name"}</h2>
      <p className={`${META} mt-[var(--s2)]`}>Signed in with</p>
      <ul className="mt-[var(--s1)] flex flex-col gap-[var(--s2)]">
        {person.signedInWith.map((way) => (
          <li key={way.method}>
            <p className={READ}>{methodLabel(way.method)}</p>
            <p className={META_PLAIN}>{way.contactLine}</p>
          </li>
        ))}
      </ul>

      <p className={`${META} mt-[var(--s3)]`}>Rooms</p>
      {person.rooms.length === 0 ? (
        <p className={META_PLAIN}>No room is bound to this person.</p>
      ) : (
        <ul>
          {person.rooms.map((room) => (
            <RoomRow key={room.token} room={room} />
          ))}
        </ul>
      )}

      <p className={`${META} mt-[var(--s3)]`}>Bookings</p>
      {person.bookings.length === 0 ? (
        <p className={META_PLAIN}>No booking is matched to this person.</p>
      ) : (
        <ul>
          {person.bookings.map((booking) => (
            <BookingRow key={`${booking.startsAt}-${booking.topic}`} booking={booking} />
          ))}
        </ul>
      )}

      <p className={`${META} mt-[var(--s3)]`}>White-label partner</p>
      <p className={READ_MUTED}>{person.whiteLabelLine}</p>
    </article>
  );
}

export function PeopleList({ data }: { data: AdminPeopleResponse }) {
  return (
    <div>
      <p className={READ_MUTED} data-testid="text-admin-offered">
        {offeredLine(data.offeredSignIn)}
        {data.house ? "" : " A partner deployment sees only its own people."}
      </p>
      {data.people.length === 0 ? (
        <p className={`${READ} mt-[var(--s4)]`} data-testid="text-admin-empty">
          Nobody has signed in on this deployment.
        </p>
      ) : (
        <div className="mt-[var(--s4)]">
          {data.people.map((person) => (
            <Person key={person.id} person={person} />
          ))}
        </div>
      )}
    </div>
  );
}
