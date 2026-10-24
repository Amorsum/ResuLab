import { careerEnsure, type CareerSource } from './career.js';
/** Conservative tripwires, in addition to model instructions and human review. */
export function checkFactualClaims(value: string | string[], sources: CareerSource[], path: string) {
  const output = Array.isArray(value) ? value.join('\n') : value;
  const source = sources.map(item => item.quote).join('\n');
  for (const claim of ['主导', '独立负责', '全面负责', '带领团队', '精通', '专家', '显著提升', '大幅提升']) {
    if (output.includes(claim)) careerEnsure(source.includes(claim) && !new RegExp(`(?:未|不|没有|不能|并非|非)[^，。；\n]{0,8}${claim}`).test(source), 'unsupported_responsibility', path);
  }
  // Named technologies must occur in this item's own evidence, never only in the JD.
  const technologies = output.match(/\b(?:React|Vue|Angular|TypeScript|JavaScript|Python|Java|SQL|MySQL|PostgreSQL|Redis|Docker|Kubernetes|TensorFlow|PyTorch|Figma|Excel|Tableau|Spark|Hadoop)\b/gi) || [];
  for (const technology of technologies) {
    const escaped = technology.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    careerEnsure(new RegExp(`\\b${escaped}\\b`, 'i').test(source), 'unsupported_technology', path);
    careerEnsure(!new RegExp(`(?:未|没有|不曾|未曾)[^，。；\n]{0,12}\\b${escaped}\\b`, 'i').test(source), 'negated_technology', path);
  }
  const lines = output.split(/[\n；]/).map(line => line.trim()).filter(Boolean);
  careerEnsure(new Set(lines).size === lines.length, 'duplicate_claim', path);
}
