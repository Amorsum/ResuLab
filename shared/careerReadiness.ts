import type { CareerFact } from './career.js';
export interface FactQuestion { factId: string; title: string; question: string; priority: number }
/** Fact-specific questions, only for missing fields. No scores or inferred achievements. */
export function factQuestions(facts: CareerFact[]): FactQuestion[] {
  const questions: FactQuestion[] = [];
  for (const fact of facts) {
    if (!['projects', 'workExperience', 'education'].includes(fact.section)) continue;
    const row = fact.data as unknown as Record<string, unknown>;
    const title = String(row.projectName || row.companyName || row.schoolName);
    const description = String(row.description || '');
    const add = (question: string, priority: number) => questions.push({ factId: fact.id, title, question, priority });
    if (row.startDate && row.endDate && String(row.startDate) > String(row.endDate)) add('开始时间晚于结束时间，请在原始材料中核对日期。', 0);
    else if (!description.trim() || description.trim().length < 25) add('你本人具体做了哪部分？用了什么方法，留下了什么作品或交付物？没有数字也可以。', 1);
    else if (!/使用|通过|用|基于|采用|访谈|调研|分析|设计|测试|整理/.test(description)) add('这项工作是怎样完成的？补充实际使用的方法或工具即可。', 2);
    else if (!/交付|完成|实现|报告|页面|文档|原型|论文|作品|展示|周报|接口|结果|提交|整理/.test(description)) add('最后交付了什么？例如报告、演示、原型或活动材料；不确定结果时不必提供数字。', 3);
  }
  return questions.sort((a, b) => a.priority - b.priority).slice(0, 3);
}
