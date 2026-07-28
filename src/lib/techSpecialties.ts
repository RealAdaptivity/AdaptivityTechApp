/** Technician trade specialties (keep in sync with adaptivity-performance). */

export type TechSpecialty =
  | 'mechanical'
  | 'audio'
  | 'tint'
  | 'wrap'
  | 'bodywork'
  | 'modification'
  | 'detailing'
  | 'tires'
  | 'glass'
  | 'performance';

export type TechSpecialtyOption = {
  id: TechSpecialty;
  label: string;
  roleTitle: string;
  shortLabel: string;
  description: string;
};

export const TECH_SPECIALTIES: TechSpecialtyOption[] = [
  {
    id: 'mechanical',
    label: 'ASE / Mechanical Technician',
    roleTitle: 'ASE Technician',
    shortLabel: 'Mechanical',
    description: 'Diagnostics, brakes, fluids, battery, AC, suspension, exhaust, and general repair.',
  },
  {
    id: 'tires',
    label: 'Tire & Wheel Technician',
    roleTitle: 'Tire Technician',
    shortLabel: 'Tires',
    description: 'Mount, balance, rotation, flats, TPMS, and wheel service.',
  },
  {
    id: 'glass',
    label: 'Auto Glass Technician',
    roleTitle: 'Glass Technician',
    shortLabel: 'Glass',
    description: 'Windshield chips, replacements, and side/rear glass.',
  },
  {
    id: 'bodywork',
    label: 'Body Work Technician',
    roleTitle: 'Body Work Technician',
    shortLabel: 'Body Work',
    description: 'Dent repair, collision panels, paint prep, and cosmetic body work.',
  },
  {
    id: 'detailing',
    label: 'Mobile Detailing Technician',
    roleTitle: 'Detailing Technician',
    shortLabel: 'Detailing',
    description: 'Detailing, ceramic coating, paint correction, and headlight restore.',
  },
  {
    id: 'audio',
    label: 'Audio Technician',
    roleTitle: 'Audio Technician',
    shortLabel: 'Audio',
    description: 'Head units, speakers, amps, and sound system installs.',
  },
  {
    id: 'tint',
    label: 'Tint Technician',
    roleTitle: 'Tint Technician',
    shortLabel: 'Tint',
    description: 'Window tint measure, film, and mobile install.',
  },
  {
    id: 'wrap',
    label: 'Wrap / PPF Technician',
    roleTitle: 'Wrap Technician',
    shortLabel: 'Wrap / PPF',
    description: 'Vinyl wraps, color change, and paint protection film.',
  },
  {
    id: 'modification',
    label: 'Modification Technician',
    roleTitle: 'Modification Technician',
    shortLabel: 'Mods',
    description: 'Interior lighting, color, accessories, and custom cabin upgrades.',
  },
  {
    id: 'performance',
    label: 'Performance Technician',
    roleTitle: 'Performance Technician',
    shortLabel: 'Performance',
    description: 'Tuning, intakes, exhaust upgrades, and performance installs.',
  },
];

export const ALL_TECH_SPECIALTY_IDS: TechSpecialty[] = TECH_SPECIALTIES.map((s) => s.id);

export function roleTitleFromSpecialties(specialties: TechSpecialty[]): string {
  const unique = [...new Set(specialties)];
  if (unique.length === 1) {
    return TECH_SPECIALTIES.find((s) => s.id === unique[0])?.roleTitle || 'ASE Technician';
  }
  if (unique.length > 1) return 'Multi-Trade Technician';
  return 'ASE Technician';
}

export function normalizeSpecialties(raw: unknown): TechSpecialty[] {
  const allowed = new Set<TechSpecialty>(ALL_TECH_SPECIALTY_IDS);
  const list = Array.isArray(raw) ? raw.map(String) : [];
  const out = list.filter((s): s is TechSpecialty => allowed.has(s as TechSpecialty));
  return out.length ? [...new Set(out)] : ['mechanical'];
}
