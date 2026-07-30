import { TECH_SPECIALTIES, type TechSpecialty } from './techSpecialties';

export function specialtyForLabel(label: string): TechSpecialty {
  const t = label.toLowerCase();
  if (/\b(tint|window\s*tint|ceramic\s*tint)\b/.test(t) || t.includes('window tint')) return 'tint';
  if (/\b(ppf|paint\s*protection|clear\s*bra)\b/.test(t)) return 'wrap';
  if (/\b(wrap|vinyl\s*wrap|vehicle\s*wrap)\b/.test(t) || t.includes('vehicle wrap')) return 'wrap';
  if (
    /\b(body\s*work|bodywork|dent|dents|collision|paintless|pdr|fender|bumper\s*repair)\b/.test(t) ||
    t.includes('body work')
  ) {
    return 'bodywork';
  }
  if (
    /\b(interior\s*light|ambient\s*light|footwell|cabin\s*light|led\s*interior|interior\s*color|cabin\s*color|dash\s*color|trim\s*color|recolor|accessor|remote\s*start|running\s*board|roof\s*rack|backup\s*camera)\b/.test(
      t
    ) ||
    t.includes('interior lighting') ||
    t.includes('interior color') ||
    t.includes('accessories')
  ) {
    return 'modification';
  }
  if (
    /\b(ceramic\s*coat|paint\s*correction|swirl|polish|headlight\s*restor|headlamp\s*restor|detail|detailing|mobile\s*detail|wash\s*and\s*wax)\b/.test(
      t
    ) ||
    t.includes('mobile detailing')
  ) {
    return 'detailing';
  }
  if (/\b(tire|tyre|flat|puncture|tpms|mount|balance|rotation|wheel|rim|curb\s*rash)\b/.test(t)) {
    return 'tires';
  }
  if (/\b(windshield|windscreen|auto\s*glass|chip\s*repair|glass)\b/.test(t)) return 'glass';
  if (/\b(tune|ecu|calibration|dyno|intake|performance\s*exhaust|cat[\s-]?back)\b/.test(t)) {
    return 'performance';
  }
  if (
    /\b(audio|stereo|speaker|head\s*unit|subwoofer|car\s*audio)\b/.test(t) ||
    t.includes('car audio')
  ) {
    return 'audio';
  }
  return 'mechanical';
}

export function specialtiesNeededForJob(jobServices: string[]): TechSpecialty[] {
  const needed = new Set(
    (jobServices.length ? jobServices : ['diagnostic']).map(specialtyForLabel)
  );
  return [...needed];
}

export function techCanClaimServices(techSpecialties: string[], jobServices: string[]): boolean {
  const has = new Set(techSpecialties.length ? techSpecialties : ['mechanical']);
  return specialtiesNeededForJob(jobServices).every((s) => has.has(s));
}

/** Short labels for specialty chips + which of those the tech already has. */
export function specialtyMatchHint(
  techSpecialties: string[],
  jobServices: string[]
): { chips: string[]; matchedLabels: string[]; hint: string } {
  const needed = specialtiesNeededForJob(jobServices);
  const has = new Set(techSpecialties.length ? techSpecialties : ['mechanical']);
  const chips = needed.map(
    (id) => TECH_SPECIALTIES.find((s) => s.id === id)?.shortLabel || id
  );
  const matchedLabels = needed
    .filter((id) => has.has(id))
    .map((id) => TECH_SPECIALTIES.find((s) => s.id === id)?.shortLabel || id);
  const hint =
    matchedLabels.length > 0
      ? `Matches your: ${matchedLabels.join(', ')}`
      : chips.length
        ? `Needs: ${chips.join(', ')}`
        : '';
  return { chips, matchedLabels, hint };
}
