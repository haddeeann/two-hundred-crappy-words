import type { ContinuityValue } from "./types";

export type ContinuityRelationshipDirection =
  "attribute" | "outgoing" | "symmetric";

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
  inverseLabel?: string;
  targetTypes?: readonly string[];
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
    description:
      "The place containing the subject during an optional time span.",
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
    description:
      "A character, faction, species, or craft involved in an event or scene.",
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
      "route",
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
    inverseLabel: "Has member",
    targetTypes: ["faction", "spacecraft"],
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
    inverseLabel: "Child of",
    targetTypes: ["character"],
  },
  {
    key: "partner-of",
    label: "Partner of",
    description:
      "A symmetric character partnership during an optional time span.",
    subjectTypes: ["character"],
    valueKinds: ["note"],
    simultaneousValues: "many",
    allowsValidityBounds: true,
    direction: "symmetric",
    inverseProperty: "partner-of",
    inverseLabel: "Partner of",
    targetTypes: ["character"],
  },
  {
    key: "operated-by",
    label: "Operated by",
    description:
      "The character or faction operating a spacecraft or technology.",
    subjectTypes: ["spacecraft", "technology"],
    valueKinds: ["note"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: true,
    direction: "outgoing",
    inverseProperty: null,
    inverseLabel: "Operates",
    targetTypes: ["character", "faction"],
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
    inverseLabel: "Home to",
    targetTypes: ["location", "spacecraft"],
  },
  {
    key: "contained-by",
    label: "Contained by",
    description:
      "The direct writer-asserted container of a location during an optional time span.",
    subjectTypes: ["location"],
    valueKinds: ["note"],
    simultaneousValues: "many",
    allowsValidityBounds: true,
    direction: "outgoing",
    inverseProperty: null,
    targetTypes: ["location", "spacecraft"],
  },
  {
    key: "route-origin",
    label: "Route origin",
    description: "The directional origin of a reusable route profile.",
    subjectTypes: ["route"],
    valueKinds: ["note"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: false,
    direction: "outgoing",
    inverseProperty: null,
    targetTypes: ["location", "spacecraft"],
  },
  {
    key: "route-destination",
    label: "Route destination",
    description: "The directional destination of a reusable route profile.",
    subjectTypes: ["route"],
    valueKinds: ["note"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: false,
    direction: "outgoing",
    inverseProperty: null,
    targetTypes: ["location", "spacecraft"],
  },
  {
    key: "travel-model",
    label: "Travel model",
    description:
      "An optional technology or spacecraft whose prose explains the route's travel assumptions.",
    subjectTypes: ["route"],
    valueKinds: ["note"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: false,
    direction: "outgoing",
    inverseProperty: null,
    targetTypes: ["technology", "spacecraft"],
  },
  {
    key: "travel-duration",
    label: "Travel duration",
    description:
      "An explicit elapsed duration or inclusive duration window for a route.",
    subjectTypes: ["route"],
    valueKinds: ["quantity", "range"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: true,
    direction: "attribute",
    inverseProperty: null,
  },
  {
    key: "travel-distance",
    label: "Travel distance",
    description:
      "Optional route context that is never converted into travel time automatically.",
    subjectTypes: ["route"],
    valueKinds: ["quantity", "range"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: false,
    direction: "attribute",
    inverseProperty: null,
  },
  {
    key: "uses-route",
    label: "Uses route",
    description:
      "The reusable directional route profile used by a specific event or scene journey.",
    subjectTypes: ["event", "scene"],
    valueKinds: ["note"],
    simultaneousValues: "one-to-review",
    allowsValidityBounds: false,
    direction: "outgoing",
    inverseProperty: null,
    targetTypes: ["route"],
  },
] as const satisfies readonly ContinuityPropertyDefinition[];

const DEFINITIONS_BY_KEY = new Map<string, ContinuityPropertyDefinition>(
  CONTINUITY_PROPERTY_DEFINITIONS.map((definition) => [
    definition.key,
    definition,
  ]),
);

export function continuityPropertyDefinition(
  key: string,
): ContinuityPropertyDefinition | null {
  return DEFINITIONS_BY_KEY.get(key) ?? null;
}
