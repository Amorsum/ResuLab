import type { ResumeData } from '../types/resume';

export const createEmptyResume = (): ResumeData => ({
  templateId: 'classic',
  accentColor: '#2563eb',
  fontFamily: 'yahei',
  fontSize: 14,
  lineHeight: 22,
  pageMargin: 15,
  lastModified: Date.now(),
  personalInfo: {
    fullName: '',
    gender: '',
    birthYear: '',
    birthMonth: '',
    phone: '',
    email: '',
    city: '',
    avatar: '',
    jobTitle: '',
    yearsOfExperience: '',
  },
  jobIntention: {
    desiredPosition: '',
    desiredCity: '',
    expectedSalary: '',
    jobType: '',
    availableDate: '',
  },
  education: [],
  workExperience: [],
  projects: [],
  skills: [],
  certificates: [],
  languages: [],
  selfEvaluation: '',
  socialLinks: [],
});

export const DEFAULT_RESUME = createEmptyResume();

/** 生成唯一 ID */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};
