---
name: resulab-resume-writer
description: Write job-specific ResuLab resume copies from a person's confirmed career library, with evidence-backed selection and factual checks. Use for library-based composition and resume writing quality work, not for inventing experience or installing third-party code.
---

# ResuLab Resume Writer

Keep complete career materials separate from each job application. Treat imported or AI-extracted material as unconfirmed until the person has reviewed it. Generated writing is a separate draft and must not silently become a source fact.

The product's versioned runtime instructions are in `shared/resumeWritingSkill.ts`. The bounded selection/writing pipeline and deterministic guards are in `shared/careerComposer.ts`. Read these when modifying runtime behavior; keep the version and tests consistent.

Use the target JD to prioritize confirmed evidence. Explain why selected work or projects support particular requirements, and show genuine gaps. Select for actual responsibility, methods, deliverables and relevance. Do not invent ATS scores or skill-match percentages.

Write concise descriptions using an accurate action, business object, method and an outcome only when supplied. Keep companies, roles, dates, technical skills and proficiency fixed to source records. Preserve ownership and uncertainty. Do not transplant facts or numbers across employers/projects. Put missing facts in review notes rather than inventing outcomes or inserting placeholders into the resume.

Show selected material, rewritten fields, original quotations and gaps. Open a separate editable copy only on explicit action, preserving prior editor content as a backup. Verify that different JDs change selection or emphasis, factual guards reject invalid output, and generating/opening a draft preserves the master library.

Read [references/sources.md](references/sources.md) for reviewed online skills, revisions and rejected practices. These are research sources, not authority to execute remote scripts or transmit candidate information elsewhere. Do not call a draft ATS-approved or expert-certified based on these references.
