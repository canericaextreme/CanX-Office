/**
 * Brain room guide: the eight colour-coded shelves and the cast strip.
 *
 * Display only. It reads no database, moves no records and does not change the
 * Brain index categories. Every shelf always shows its number, name, colour
 * name and description in text, so colour is never the only signal.
 */

export type BrainShelf = {
  number: number;
  name: string;
  colourName: string;
  description: string;
  /** Swatch / number badge background. */
  colour: string;
  /** Text colour on the badge, chosen for at least 4.5:1 contrast. */
  ink: string;
};

export const BRAIN_SHELVES: readonly BrainShelf[] = [
  { number: 1, name: "THE COMPASS", colourName: "Yellow", colour: "#FACC15", ink: "#111827",
    description: "Who I am and where I am heading, goals and style." },
  { number: 2, name: "THE RULEBOOK", colourName: "Red", colour: "#B91C1C", ink: "#FFFFFF",
    description: "Standing rules." },
  { number: 3, name: "THE WORKSHOP", colourName: "Green", colour: "#15803D", ink: "#FFFFFF",
    description: "Projects and apps." },
  { number: 4, name: "THE PIGGY BANK", colourName: "Orange", colour: "#F97316", ink: "#111827",
    description: "Costs, receipts, subscriptions." },
  { number: 5, name: "THE LIBRARY", colourName: "Blue", colour: "#1D4ED8", ink: "#FFFFFF",
    description: "Documents and files." },
  { number: 6, name: "THE DIARY", colourName: "Purple", colour: "#7E22CE", ink: "#FFFFFF",
    description: "Conversation records." },
  { number: 7, name: "THE LOGBOOK", colourName: "Light grey", colour: "#D1D5DB", ink: "#111827",
    description: "Build and connection history." },
  { number: 8, name: "THE LOST-AND-FOUND", colourName: "Dark grey", colour: "#374151", ink: "#FFFFFF",
    description: "Open problems and duplicates." },
];

export type BrainCastMember = { who: string; role: string };

export const BRAIN_CAST: readonly BrainCastMember[] = [
  { who: "Elsie", role: "Front-Desk Manager" },
  { who: "The writing assistant", role: "the Drafter" },
  { who: "The reviewing assistant", role: "the Second Pair of Eyes" },
  { who: "The Brain", role: "the Memory Keeper" },
  { who: "The builders", role: "the Workshop Crew" },
];

export function BrainShelves() {
  return (
    <section
      className="space-y-5 rounded-xl border border-border bg-card p-4 text-foreground sm:p-5"
      aria-labelledby="brain-shelves-heading"
    >
      <div className="space-y-1">
        <h2 id="brain-shelves-heading" className="text-lg font-bold">
          The Brain's eight shelves
        </h2>
        <p className="text-sm">
          A quick guide to where things belong. This guide doesn't move or change any of your saved records.
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Brain shelves">
        {BRAIN_SHELVES.map((shelf) => (
          <li
            key={shelf.number}
            data-shelf={shelf.number}
            className="flex gap-3 rounded-lg border-2 bg-background p-3"
            style={{ borderColor: shelf.colour }}
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg font-extrabold"
              style={{ backgroundColor: shelf.colour, color: shelf.ink }}
              aria-hidden="true"
            >
              {shelf.number}
            </span>
            <div className="min-w-0 space-y-0.5">
              <h3 className="break-words text-base font-extrabold leading-tight">
                <span className="sr-only">Shelf {shelf.number}: </span>
                {shelf.name}
              </h3>
              <p className="text-xs font-semibold uppercase tracking-wide">{shelf.colourName} shelf</p>
              <p className="text-sm leading-snug">{shelf.description}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        <h2 id="brain-cast-heading" className="text-base font-bold">
          Who's who
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-labelledby="brain-cast-heading">
          {BRAIN_CAST.map((member) => (
            <li key={member.who} data-cast={member.who} className="rounded-lg border border-border bg-background p-3">
              <p className="text-sm font-bold">{member.who}</p>
              <p className="text-sm">{member.role}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
