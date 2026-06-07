// ===================== 枚举 / 常量类型 =====================

export type TemplateId = 'classic' | 'modern' | 'minimal';

export type Gender = '' | '男' | '女';

export type DegreeLevel =
  | '高中' | '中专' | '大专'
  | '本科' | '学士'
  | '硕士' | '博士'
  | 'MBA' | 'EMBA';

export type LanguageLevel =
  | '母语' | '精通' | '熟练' | '良好' | '一般';

export type SkillLevel =
  | '精通' | '熟练' | '掌握' | '了解';

export type JobType = '' | '全职' | '兼职' | '实习';

export type FontFamily = 'songti' | 'yahei' | 'kaiti' | 'fangsong';

export type PageMargin = number;

// ===================== 核心实体 =====================

export interface PersonalInfo {
  fullName: string;
  gender: Gender;
  birthYear: string;
  birthMonth: string;
  phone: string;
  email: string;
  city: string;
  avatar: string;           // base64 data URL
  jobTitle: string;
  yearsOfExperience: string;
}

export interface JobIntention {
  desiredPosition: string;
  desiredCity: string;
  expectedSalary: string;
  jobType: JobType;
  availableDate: string;
}

export interface Education {
  id: string;
  schoolName: string;
  degree: DegreeLevel;
  major: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  gpa: string;
  description: string;
}

export interface WorkExperience {
  id: string;
  companyName: string;
  position: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  city: string;
  description: string;
  highlights: string[];
}

export interface Project {
  id: string;
  projectName: string;
  role: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  techStack: string[];
  url: string;
}

export interface Skill {
  id: string;
  skillName: string;
  level: SkillLevel;
  category: string;
}

export interface Certificate {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

export interface Language {
  id: string;
  language: string;
  level: LanguageLevel;
  score: string;
}

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
}

// ===================== 聚合 Resume 类型 =====================

export interface ResumeData {
  templateId: TemplateId;
  accentColor: string;
  fontFamily: FontFamily;
  fontSize: number;
  lineHeight: number;
  pageMargin: PageMargin;
  lastModified: number;
  personalInfo: PersonalInfo;
  jobIntention: JobIntention;
  education: Education[];
  workExperience: WorkExperience[];
  projects: Project[];
  skills: Skill[];
  certificates: Certificate[];
  languages: Language[];
  selfEvaluation: string;
  socialLinks: SocialLink[];
  /** 云端简历 ID（已保存到云端时有值） */
  _cloudId?: string;
}

// ===================== 云端简历元数据 =====================

/** 云端简历列表项（不含完整 data） */
export interface CloudResumeMeta {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// ===================== 表单区域可见性 =====================

export interface FormSectionsState {
  personalInfo: boolean;
  jobIntention: boolean;
  education: boolean;
  workExperience: boolean;
  projects: boolean;
  skills: boolean;
  certificates: boolean;
  languages: boolean;
  selfEvaluation: boolean;
  socialLinks: boolean;
}

// ===================== 数组区域名称 =====================

export type ArraySectionName =
  | 'education' | 'workExperience' | 'projects'
  | 'skills' | 'certificates' | 'languages' | 'socialLinks';
