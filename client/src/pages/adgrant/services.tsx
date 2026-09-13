import DoorCard from "@/components/site/DoorCard";
import { DISPLAY, PAGE, READ_MUTED } from "@/components/site/doors/quiet";
import { listedDoors } from "@/pages/adgrant/catalogue";
import { Meta } from "@/components/adgrant/Meta";

/**
 * The AdGrant catalogue as a list. Every visible cloned door, including
 * coming ones; hidden rows stay off this page the way they stay off every
 * other list.
 */
export function Services() {
  const doors = listedDoors();

  return (
    <>
      <Meta
        title="Services — AdGrant.AI"
        description="The same doors as the rest of this company, each one rewritten for what that work is for a nonprofit."
      />
      <section className={`${PAGE} pt-[var(--s5)] pb-[var(--s6)]`}>
        <h1 className={DISPLAY}>Services for a nonprofit</h1>
        <p className={`mt-[var(--s3)] max-w-[46ch] ${READ_MUTED}`}>
          Each row opens a conversation rather than a form. The agent, the starters and the name on the room are
          what that service does for a nonprofit. Hidden rows are not listed here.
        </p>
        <div className="mt-[var(--s5)]">
          {doors.map((door, position) => (
            <DoorCard key={door.id} door={door} index={position + 1} />
          ))}
        </div>
      </section>
    </>
  );
}

export default Services;
