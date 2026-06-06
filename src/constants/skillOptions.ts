export const SKILL_CATEGORIES = [
  '编程语言',
  '框架/库',
  '开发工具',
  '数据库',
  '云计算/DevOps',
  '设计工具',
  '办公软件',
  '其他',
];

export const SKILL_PRESETS: Record<string, string[]> = {
  '编程语言': ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift'],
  '框架/库': ['React', 'Vue', 'Angular', 'Node.js', 'Spring', 'Django', 'Flask', 'Express'],
  '开发工具': ['Git', 'Docker', 'VS Code', 'Webpack', 'Vite', 'Jest', 'Postman', 'Figma'],
  '数据库': ['MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'SQLite'],
  '云计算/DevOps': ['AWS', 'Azure', 'GCP', 'Nginx', 'CI/CD', 'Kubernetes', 'Linux'],
  '设计工具': ['Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator'],
  '办公软件': ['Word', 'Excel', 'PowerPoint', 'Notion', '飞书', '钉钉'],
  '其他': ['项目管理', '数据分析', '技术写作', '团队管理'],
};
