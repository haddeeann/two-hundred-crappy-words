import type { StructuredNoteType } from "$lib/project/structured-note";

export interface GuidedLoreField {
  id: string;
  label: string;
  placeholder: string;
  section: string;
  subheading?: string;
}

export interface GuidedLoreForm {
  choice: string;
  description: string;
  nameLabel: string;
  fields: readonly GuidedLoreField[];
}

export const MAX_GUIDED_LORE_ANSWER_LENGTH = 2_000;

export const GUIDED_LORE_TYPES = [
  "character",
  "location",
  "event",
  "faction",
  "technology",
  "species",
  "spacecraft",
  "route",
] as const satisfies readonly StructuredNoteType[];

export const GUIDED_LORE_FORMS: Readonly<Record<(typeof GUIDED_LORE_TYPES)[number], GuidedLoreForm>> = {
  character: {
    choice: "Someone",
    description: "A person whose choices matter.",
    nameLabel: "What do you call them?",
    fields: [
      { id: "role", label: "Who are they here?", placeholder: "Their place in this story or world.", section: "Summary" },
      { id: "desire", label: "What do they want?", placeholder: "A need, hope, duty, or immediate aim.", section: "Desire and conflict", subheading: "Desire" },
      { id: "difficulty", label: "What makes that difficult?", placeholder: "Pressure, opposition, fear, or contradiction.", section: "Desire and conflict", subheading: "Difficulty" },
      { id: "consistency", label: "One thing to keep consistent", placeholder: "A fact future scenes should not contradict.", section: "Notes", subheading: "Keep consistent" },
      { id: "connections", label: "Who or what are they connected to?", placeholder: "Names are enough; links can come later.", section: "Notes", subheading: "Connections" },
    ],
  },
  location: {
    choice: "Somewhere",
    description: "A place characters can enter, leave, or remember.",
    nameLabel: "What is this place called?",
    fields: [
      { id: "meaning", label: "What is this place?", placeholder: "Why it matters in one or two sentences.", section: "Summary" },
      { id: "feel", label: "What does it feel like?", placeholder: "Scale, climate, sound, light, hazards, or texture.", section: "Environment" },
      { id: "people", label: "Who lives or works here?", placeholder: "People, communities, visitors, or absences.", section: "People and power", subheading: "People" },
      { id: "power", label: "Who controls it?", placeholder: "Formal power, custom, ownership, or contest.", section: "People and power", subheading: "Power" },
      { id: "story", label: "What should stay true when it appears?", placeholder: "A story use, limit, route, or consistent detail.", section: "Story use" },
    ],
  },
  event: {
    choice: "Something that happened",
    description: "An event with causes, witnesses, or consequences.",
    nameLabel: "What do people call this event?",
    fields: [
      { id: "happened", label: "What happened?", placeholder: "The smallest useful account.", section: "Summary" },
      { id: "when", label: "When and where?", placeholder: "Exact, approximate, fictional, or unknown dates are welcome.", section: "When and where" },
      { id: "causes", label: "What led to it?", placeholder: "Conditions, choices, accidents, or disputed causes.", section: "Causes" },
      { id: "consequences", label: "What changed afterward?", placeholder: "Immediate effects, long echoes, or disagreements.", section: "Consequences" },
    ],
  },
  faction: {
    choice: "A group",
    description: "People organized by purpose, identity, or power.",
    nameLabel: "What is this group called?",
    fields: [
      { id: "bond", label: "What binds them together?", placeholder: "A purpose, belief, need, history, or identity.", section: "Summary" },
      { id: "goals", label: "What do they want?", placeholder: "Now and in the longer term.", section: "Goals" },
      { id: "methods", label: "How do they act?", placeholder: "Methods, resources, limits, or internal rules.", section: "Methods and resources" },
      { id: "relationships", label: "Who supports or opposes them?", placeholder: "Allies, rivals, divisions, or reputation.", section: "Relationships" },
    ],
  },
  technology: {
    choice: "A technology",
    description: "A tool or system with capabilities and costs.",
    nameLabel: "What is it called?",
    fields: [
      { id: "purpose", label: "What does it do?", placeholder: "Its useful purpose and who can use it.", section: "Summary" },
      { id: "rules", label: "What are its limits or costs?", placeholder: "Dependencies, failure modes, scarcity, or tradeoffs.", section: "Rules" },
      { id: "consequences", label: "How has it changed life or power?", placeholder: "Ordinary effects as well as dramatic ones.", section: "Consequences" },
      { id: "story", label: "How can it complicate the story?", placeholder: "Problems it creates as well as solves.", section: "Story use" },
    ],
  },
  species: {
    choice: "A people or species",
    description: "Living beings with meaningful variation.",
    nameLabel: "What are they called?",
    fields: [
      { id: "distinct", label: "What makes them distinct?", placeholder: "The useful starting point, not an exhaustive definition.", section: "Summary" },
      { id: "biology", label: "What matters about their bodies or needs?", placeholder: "Senses, life cycle, environment, or variation.", section: "Biology" },
      { id: "culture", label: "What do they disagree about?", placeholder: "Values and divisions without treating a people as a monoculture.", section: "Culture" },
      { id: "story", label: "How does this shape choices?", placeholder: "Conflict, connection, access, or misunderstanding.", section: "Story implications" },
    ],
  },
  spacecraft: {
    choice: "A spacecraft",
    description: "A vessel with a purpose, crew, and limits.",
    nameLabel: "What is the craft called?",
    fields: [
      { id: "identity", label: "What kind of craft is it?", placeholder: "Purpose, class, owner, or defining character.", section: "Summary" },
      { id: "capabilities", label: "What can it do?", placeholder: "Drive, range, crew, payload, defenses, or systems.", section: "Capabilities" },
      { id: "limits", label: "What constrains it?", placeholder: "Costs, maintenance, vulnerabilities, or rules.", section: "Limits" },
      { id: "history", label: "Why does it matter to the story?", placeholder: "History, reputation, occupants, or coming trouble.", section: "History and story role" },
    ],
  },
  route: {
    choice: "A journey or route",
    description: "A directional path with time, cost, and hazards.",
    nameLabel: "What do you call this route?",
    fields: [
      { id: "meaning", label: "What journey does it describe?", placeholder: "Why someone would travel it.", section: "Summary" },
      { id: "path", label: "Where does it begin and end?", placeholder: "Endpoints, waypoints, access, or hazards.", section: "Path and endpoints" },
      { id: "travel", label: "What does the trip require?", placeholder: "Duration, model, costs, limits, or assumptions.", section: "Travel assumptions" },
      { id: "story", label: "What can happen along the way?", placeholder: "Who uses it and what makes it narratively useful.", section: "Story use" },
    ],
  },
};

export function buildGuidedLoreSections(
  type: (typeof GUIDED_LORE_TYPES)[number],
  answers: Readonly<Record<string, string>>,
): Record<string, string> {
  const sections = new Map<string, string[]>();
  for (const field of GUIDED_LORE_FORMS[type].fields) {
    const answer = answers[field.id]?.trim();
    if (!answer) continue;
    if (answer.length > MAX_GUIDED_LORE_ANSWER_LENGTH) {
      throw new RangeError(
        `${field.label} must be ${MAX_GUIDED_LORE_ANSWER_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }
    const entry = field.subheading ? `### ${field.subheading}\n\n${answer}` : answer;
    sections.set(field.section, [...(sections.get(field.section) ?? []), entry]);
  }
  return Object.fromEntries([...sections].map(([heading, entries]) => [heading, entries.join("\n\n")]));
}
