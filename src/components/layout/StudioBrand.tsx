import { Link } from 'react-router-dom';

export default function StudioBrand() {
  return <Link to="/" className="studio-brand" aria-label="ResuLab 工作台">
    <span className="studio-monogram" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M6 18V6h6a4 4 0 0 1 0 8H6m6 0 6 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"/></svg></span>
    <span>ResuLab<span className="studio-brand-dot">.</span></span>
  </Link>;
}
