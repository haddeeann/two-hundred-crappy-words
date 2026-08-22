import { validateFileName } from "$lib/editor/file-tree";
import {
  validateProjectId,
  validateProjectName,
  type WorldProjectFolderRole,
} from "./manifest";

export const STRUCTURED_NOTE_TYPES = [
  "character",
  "location",
  "faction",
  "species",
  "technology",
  "spacecraft",
  "event",
  "scene",
  "chapter",
] as const;

export type StructuredNoteType = (typeof STRUCTURED_NOTE_TYPES)[number];

export interface StructuredNoteTemplate {
  label: string;
  defaultRole: WorldProjectFolderRole;
  prompts: readonly { heading: string; prompt: string }[];
}

export const STRUCTURED_NOTE_TEMPLATES: Readonly<
  Record<StructuredNoteType, StructuredNoteTemplate>
> = {
  character: {
    label: "Character",
    defaultRole: "characters",
    prompts: [
      { heading: "Summary", prompt: "Who are they in one or two sentences?" },
      { heading: "Desire and conflict", prompt: "What do they want, and what resists them?" },
      { heading: "Story role", prompt: "How do they change the story?" },
      { heading: "Notes", prompt: "Voice, appearance, history, relationships, or open questions." },
    ],
  },
  location: {
    label: "Location",
    defaultRole: "locations",
    prompts: [
      { heading: "Summary", prompt: "What is this place, and why does it matter?" },
      { heading: "Environment", prompt: "Climate, scale, hazards, resources, or sensory character." },
      { heading: "People and power", prompt: "Who lives here, and who controls it?" },
      { heading: "Story use", prompt: "Scenes, conflicts, discoveries, or travel constraints." },
    ],
  },
  faction: {
    label: "Faction",
    defaultRole: "factions",
    prompts: [
      { heading: "Summary", prompt: "What binds this group together?" },
      { heading: "Goals", prompt: "What does it want now and in the long term?" },
      { heading: "Methods and resources", prompt: "How does it exert power?" },
      { heading: "Relationships", prompt: "Allies, rivals, internal divisions, or public reputation." },
    ],
  },
  species: {
    label: "Species",
    defaultRole: "species",
    prompts: [
      { heading: "Summary", prompt: "What makes this species distinct?" },
      { heading: "Biology", prompt: "Body, senses, life cycle, needs, and meaningful variation." },
      { heading: "Culture", prompt: "Avoid a monoculture: what values and disagreements recur?" },
      { heading: "Story implications", prompt: "How does this shape choices, conflict, or connection?" },
    ],
  },
  technology: {
    label: "Technology",
    defaultRole: "technology",
    prompts: [
      { heading: "Summary", prompt: "What does it do, and who can use it?" },
      { heading: "Rules", prompt: "Capabilities, limits, costs, dependencies, and failure modes." },
      { heading: "Consequences", prompt: "How has it changed ordinary life or power?" },
      { heading: "Story use", prompt: "What problems can it create as well as solve?" },
    ],
  },
  spacecraft: {
    label: "Spacecraft",
    defaultRole: "technology",
    prompts: [
      { heading: "Summary", prompt: "Purpose, class, owner, and defining character." },
      { heading: "Capabilities", prompt: "Drive, range, crew, payload, defenses, or special systems." },
      { heading: "Limits", prompt: "Costs, maintenance, vulnerabilities, and operating constraints." },
      { heading: "History and story role", prompt: "How did it get here, and what happens aboard it?" },
    ],
  },
  event: {
    label: "Event",
    defaultRole: "timeline",
    prompts: [
      { heading: "Summary", prompt: "What happened?" },
      { heading: "When and where", prompt: "Dates, era, duration, locations, and uncertainty." },
      { heading: "Causes", prompt: "What conditions and choices produced it?" },
      { heading: "Consequences", prompt: "Immediate effects, long echoes, and disputed interpretations." },
    ],
  },
  scene: {
    label: "Scene",
    defaultRole: "manuscript",
    prompts: [
      { heading: "Scene", prompt: "Write the scene here." },
      { heading: "Planning notes", prompt: "POV, location, story date, purpose, turn, or unresolved work." },
    ],
  },
  chapter: {
    label: "Chapter",
    defaultRole: "manuscript",
    prompts: [
      { heading: "Chapter", prompt: "Write the chapter here." },
      { heading: "Planning notes", prompt: "Synopsis, included scenes, POV, status, or revision notes." },
    ],
  },
};

export function createStructuredNote({
  id,
  type,
  title,
}: {
  id: string;
  type: StructuredNoteType;
  title: string;
}): string {
  const idIssue = validateProjectId(id);
  if (idIssue) throw new RangeError(idIssue);
  const titleIssue = validateProjectName(title);
  if (titleIssue) throw new RangeError(`title ${titleIssue.slice("name ".length)}`);

  const normalizedTitle = title.trim();
  const template = STRUCTURED_NOTE_TEMPLATES[type];
  if (!template) throw new RangeError("Unknown structured note type.");

  const sections = template.prompts
    .map(
      ({ heading, prompt }) =>
        `## ${heading}\n\n<!-- ${prompt} Delete this comment whenever you like. -->`,
    )
    .join("\n\n");

  return [
    "---",
    `id: ${serializeYamlString(id)}`,
    `type: ${serializeYamlString(type)}`,
    `title: ${serializeYamlString(normalizedTitle)}`,
    "---",
    "",
    `# ${normalizedTitle}`,
    "",
    sections,
    "",
  ].join("\n");
}

export function suggestStructuredNoteFileName(
  title: string,
  type: StructuredNoteType,
): string {
  const stem = title
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return `${stem || type}.md`;
}

export function validateStructuredNoteFileName(name: string): string | null {
  const issue = validateFileName(name);
  if (issue) return issue;
  if (!name.toLocaleLowerCase().endsWith(".md")) {
    return "A structured note file name must end with .md.";
  }
  return null;
}

function serializeYamlString(value: string): string {
  return JSON.stringify(value);
}
