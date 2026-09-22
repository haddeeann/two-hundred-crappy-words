import type { ContinuityValue } from "./types";

export type ContinuityRelationshipDirection =
  | "attribute"
  | "outgoing"
  | "symmetric";

export interface ContinuityPropertyDefinition {
  key: string;
  label: string;
  description: string;
  subjectTypes: readonly string[];
  valueKinds: readonly ContinuityValue["kind"][];
  simultaneousValues: "one-to-review" | "many";
  allowsValidityBounds: boolean;
  direction: ContinuityRelationshipDirection;
  inverseProperty: string | null;
}

export const CONTINUITY_PROPERTY_DEFINITIONS = [
  {
    key: "born",
    label: "Born",
    description: "When a character was born.",
    subjectTypes: ["character"],
    valueKinds: ["time"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: false,
    direction: "attribute",
    inverseProperty: null,
  },
  {
    key: "died",
    label: "Died",
    description: "When a character died.",
    subjectTypes: ["character"],
    valueKinds: ["time"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: false,
    direction: "attribute",
    inverseProperty: null,
  },
  {
    key: "occurs-at",
    label: "Occurs at",
    description: "When an event, scene, or chapter begins or occurs.",
    subjectTypes: ["event", "scene", "chapter"],
    valueKinds: ["time"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: false,
    direction: "attribute",
    inverseProperty: null,
  },
  {
    key: "ends-at",
    label: "Ends at",
    description: "When an event, scene, or chapter ends.",
    subjectTypes: ["event", "scene", "chapter"],
    valueKinds: ["time"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: false,
    direction: "attribute",
    inverseProperty: null,
  },
  {
    key: "located-at",
    label: "Located at",
    description: "The place containing the subject during an optional time span.",
    subjectTypes: ["character", "spacecraft", "event", "scene"],
    valueKinds: ["note"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: true,
    direction: "outgoing",
    inverseProperty: null,
  },
  {
    key: "participant",
    label: "Participant",
    description: "A character, faction, species, or craft involved in an event or scene.",
    subjectTypes: ["event", "scene", "chapter"],
    valueKinds: ["note"],
    simultaneousValues: "many",
    allowsValidityBounds: true,
    direction: "outgoing",
    inverseProperty: null,
  },
  {
    key: "instance-of",
    label: "Instance of",
    description: "A writer-defined classification represented by another note.",
    subjectTypes: [
      "character",
      "location",
      "faction",
      "species",
      "technology",
      "spacecraft",
      "event",
      "scene",
      "chapter",
    ],
    valueKinds: ["note"],
    simultaneousValues: "many",
    allowsValidityBounds: true,
    direction: "outgoing",
    inverseProperty: null,
  },
  {
    key: "species",
    label: "Species",
    description: "The species note associated with a character.",
    subjectTypes: ["character"],
    valueKinds: ["note"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: true,
    direction: "outgoing",
    inverseProperty: null,
  },
  {
    key: "member-of",
    label: "Member of",
    description: "A faction, organization, or crew the subject belongs to.",
    subjectTypes: ["character", "faction", "spacecraft"],
    valueKinds: ["note"],
    simultaneousValues: "many",
    allowsValidityBounds: true,
    direction: "outgoing",
    inverseProperty: null,
  },
  {
    key: "parent-of",
    label: "Parent of",
    description: "A directed parent-to-child character relationship.",
    subjectTypes: ["character"],
    valueKinds: ["note"],
    simultaneousValues: "many",
    allowsValidityBounds: true,
    direction: "outgoing",
    inverseProperty: null,
  },
  {
    key: "partner-of",
    label: "Partner of",
    description: "A symmetric character partnership during an optional time span.",
    subjectTypes: ["character"],
    valueKinds: ["note"],
    simultaneousValues: "many",
    allowsValidityBounds: true,
    direction: "symmetric",
    inverseProperty: "partner-of",
  },
  {
    key: "operated-by",
    label: "Operated by",
    description: "The character or faction operating a spacecraft or technology.",
    subjectTypes: ["spacecraft", "technology"],
    valueKinds: ["note"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: true,
    direction: "outgoing",
    inverseProperty: null,
  },
  {
    key: "home-port",
    label: "Home port",
    description: "The customary base location of a spacecraft.",
    subjectTypes: ["spacecraft"],
    valueKinds: ["note"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: true,
    direction: "outgoing",
    inverseProperty: null,
  },
] as const satisfies readonly ContinuityPropertyDefinition[];

const DEFINITIONS_BY_KEY = new Map<string, ContinuityPropertyDefinition>(
  CONTINUITY_PROPERTY_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function continuityPropertyDefinition(
  key: string,
): ContinuityPropertyDefinition | null {
  return DEFINITIONS_BY_KEY.get(key) ?? null;
}
