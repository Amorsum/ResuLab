/** 验证手机号（中国大陆） */
export function isValidPhone(phone: string): boolean {
  if (!phone) return true; // 可选字段
  return /^1[3-9]\d{9}$/.test(phone.replace(/\s|-/g, ''));
}

/** 验证邮箱 */
export function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 验证 URL */
export function isValidUrl(url: string): boolean {
  if (!url) return true;
  return /^https?:\/\/.+/.test(url);
}

/** 获取必填字段验证错误 */
export function getRequiredErrors(data: {
  fullName?: string;
  phone?: string;
  email?: string;
}): string[] {
  const errors: string[] = [];
  if (!data.fullName?.trim()) {
    errors.push('请输入姓名');
  }
  if (data.phone && !isValidPhone(data.phone)) {
    errors.push('手机号格式不正确');
  }
  if (data.email && !isValidEmail(data.email)) {
    errors.push('邮箱格式不正确');
  }
  return errors;
}
