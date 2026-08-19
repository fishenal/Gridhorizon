/** Flag / town / legacy waypoint — used for influence & toll, not build spacing. */
export const SPACED_STRUCTURE_TYPES = ["flag", "town", "waypoint"] as const;

export type SpacedStructureType = (typeof SPACED_STRUCTURE_TYPES)[number];

export function isSpacedStructureType(type: string): type is SpacedStructureType {
  return (SPACED_STRUCTURE_TYPES as readonly string[]).includes(type);
}

/** Farm / quarry / lumber — workplaces for the labor system. */
export const WORKPLACE_TYPES = ["mine", "farm", "lumber"] as const;

export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export function isWorkplaceType(type: string): type is WorkplaceType {
  return (WORKPLACE_TYPES as readonly string[]).includes(type as WorkplaceType);
}
