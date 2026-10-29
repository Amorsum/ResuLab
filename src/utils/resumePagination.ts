export const RESUME_PAGE_WIDTH = 794;
export const RESUME_PAGE_HEIGHT = 1123;
export const RESUME_PAGE_GAP = 20;
const CONTINUATION_MARGIN = 40;

export interface ResumePageSlice { start: number; end: number; top: number }
export interface ProtectedBand { top: number; bottom: number }

/** Share these source-coordinate slices between the visual pages and PDF export. */
export function paginateBands(height: number, bands: ProtectedBand[], preferredBreaks: number[] = []): ResumePageSlice[] {
  if (height <= RESUME_PAGE_HEIGHT) return [{ start: 0, end: RESUME_PAGE_HEIGHT, top: 0 }];
  const pages: ResumePageSlice[] = [];
  let start = 0;
  while (start < height) {
    const top = pages.length ? CONTINUATION_MARGIN : 0;
    const capacity = RESUME_PAGE_HEIGHT - top - CONTINUATION_MARGIN;
    const limit = Math.min(height, start + capacity);
    let end = limit;
    if (end < height) {
      // Prefer a nearby entry/section boundary, but never waste most of a page.
      const preferred = preferredBreaks.filter(y => y > start + capacity * .75 && y <= limit);
      if (preferred.length) end = Math.max(...preferred);
      // Both columns participate: a boundary must be safe for every line and image.
      let previous;
      do {
        previous = end;
        for (const band of bands) {
          if (band.top < end && band.bottom > end) end = Math.min(end, band.top);
        }
      } while (end < previous && end > start);
      // Oversized indivisible content must still advance (ordinary text lines never reach this).
      if (end <= start + 1) end = limit;
    }
    pages.push({ start, end, top });
    start = end;
  }
  return pages;
}

export function measureResumePages(source: HTMLElement): ResumePageSlice[] {
  const bounds = source.getBoundingClientRect();
  if (!bounds.width) return [{ start: 0, end: RESUME_PAGE_HEIGHT, top: 0 }];
  const ratio = RESUME_PAGE_WIDTH / bounds.width;
  const bands: ProtectedBand[] = [];
  const add = (rect: DOMRect, extra = 1) => {
    if (rect.width && rect.height) bands.push({ top: Math.max(0, (rect.top - bounds.top) * ratio - extra), bottom: (rect.bottom - bounds.top) * ratio + extra });
  };
  const doc = source.ownerDocument;
  const walker = doc.createTreeWalker(source, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let node;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) add(rect);
  }
  for (const img of source.querySelectorAll('img')) add(img.getBoundingClientRect());
  // Keep section/entry headings with the first line that follows them.
  for (const heading of source.querySelectorAll('h2, .resume-entry-heading, .resume-skill-category')) {
    const following = heading.nextElementSibling;
    const rect = heading.getBoundingClientRect();
    const nextRect = following?.getBoundingClientRect();
    const lineHeight = following ? parseFloat(getComputedStyle(following).lineHeight) || 22 : 0;
    bands.push({ top: Math.max(0, (rect.top - bounds.top) * ratio - 1), bottom: nextRect ? (nextRect.top - bounds.top) * ratio + Math.min(nextRect.height * ratio, lineHeight) + 1 : (rect.bottom - bounds.top) * ratio + 1 });
  }
  const preferred = Array.from(source.querySelectorAll('.resume-section, .resume-entry')).map(el => (el.getBoundingClientRect().top - bounds.top) * ratio - 1);
  return paginateBands(Math.ceil(source.scrollHeight), bands, preferred);
}
