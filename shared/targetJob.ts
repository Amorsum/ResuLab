/** Explicit generic references, never presented as an employer's requirements. */
export const ROLE_PROFILES = [
  { title: '前端开发实习生', match: /前端|frontend|web开发/i, requirements: '使用 HTML、CSS 或 JavaScript 实现页面；理解组件与交互；能说明调试、测试及团队协作中的实际贡献。' },
  { title: '数据分析实习生', match: /数据|分析|商业分析/i, requirements: '整理和清洗数据；使用 SQL、Excel 或 Python 分析问题；明确数据口径，通过图表或报告解释发现。' },
  { title: '产品实习生', match: /产品|product/i, requirements: '理解用户问题；通过访谈、调研或反馈整理需求；设计原型或方案，说明取舍与验证过程。' },
  { title: '运营实习生', match: /运营|市场|策划/i, requirements: '理解目标受众；参与内容、活动或社群执行；整理反馈与数据，形成复盘和可交付的材料。' },
  { title: '后端开发实习生', match: /后端|服务端|backend|java开发/i, requirements: '实现业务接口或数据处理；理解数据库与接口设计；能说明测试、排错与协作中的实际贡献。' },
  { title: '设计实习生', match: /设计|交互|design/i, requirements: '理解设计问题和用户需求；制作原型或视觉作品；说明迭代依据、个人贡献和交付物。' },
] as const;
export function jobTarget(text: string, mode: 'role' | 'jd' = text.trim().length < 24 && !/[\n；;]/.test(text) ? 'role' : 'jd') {
  const value = text.trim();
  if (mode === 'jd') return { text: value, generic: false };
  const profile = ROLE_PROFILES.find(item => item.match.test(value));
  return { generic: true, text: `目标岗位：${value}\n以下为通用岗位参考，不是具体公司的招聘要求；所有要求仅作为选材方向，不得当成候选人事实。\n${profile?.requirements || '说明与目标岗位相关的课程、项目或校园实践；明确个人行动、使用的方法、交付物与协作贡献。具体技能和资格要求待补充招聘 JD 后确认。'}` };
}
