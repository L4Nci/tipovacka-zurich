import { translate, type Locale, type MessageKey } from './index.ts';
import type { MmaMethod } from '../lib/mma.ts';

export function formatMmaMethod(method: MmaMethod, locale: Locale): string {
  const keys = { ko_tko: 'mmaMethod.ko_tko', submission: 'mmaMethod.submission', decision: 'mmaMethod.decision' } as const;
  return translate(locale, keys[method]);
}

const weightClasses: Record<string, MessageKey> = {
  strawweight: 'mma.weight.strawweight', flyweight: 'mma.weight.flyweight',
  bantamweight: 'mma.weight.bantamweight', featherweight: 'mma.weight.featherweight',
  lightweight: 'mma.weight.lightweight', welterweight: 'mma.weight.welterweight',
  middleweight: 'mma.weight.middleweight', 'light heavyweight': 'mma.weight.lightHeavyweight',
  heavyweight: 'mma.weight.heavyweight', catchweight: 'mma.weight.catchweight',
};

/** Display known provider terms; never reinterpret unknown facts. */
export function formatMmaWeightClass(value: string | null | undefined, locale: Locale): string {
  if (!value) return 'MMA';
  const normalized = value.trim().toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ');
  const women = /^womens?\s+/.test(normalized);
  const key = weightClasses[normalized.replace(/^womens?\s+/, '')];
  if (!key) return value;
  const weight = translate(locale, key);
  return women ? translate(locale, 'mma.weight.women', { weight }) : weight;
}
