---
name: doc-sync
description: After making ANY code change (creating, deleting, renaming, or significantly modifying files), immediately check if project documentation files need to be updated to stay in sync. This includes README.md, CLAUDE.md, and any other .md files in the project root or .github/ directory. Use this skill whenever code changes—especially when adding/removing files, changing architecture, updating dependencies, or modifying APIs. Also use when the user says "update docs", "sync documentation", "更新文档", or asks if docs are up to date.
---

# Doc Sync — Auto-update Project Markdown Documentation

## Core Rule

**After every batch of code changes, scan the affected project documentation files and update them to reflect the new reality.** Don't wait for the user to ask. Code and docs drift apart fast—this skill prevents that.

## Which Files to Check

Only these project-level documentation files (not node_modules, not generated files):

| Priority | File | When to Update |
|----------|------|---------------|
| 🔴 High | `CLAUDE.md` | Any code change in `src/`, config files, build scripts |
| 🔴 High | `README.md` | New features, changed usage, updated tech stack, deploy changes |
| 🟡 Medium | `.github/*.md` | CI/CD changes, PR/issue template changes |
| 🟢 Low | `CHANGELOG.md` | Only if it exists and the change is user-facing |

## What to Check After Each Code Change

### 1. File Added → Check "Key Files" / "Project Structure" sections

When you create a new source file, ask: "Does any doc list the project's key files? If so, should this new file be added to that list?"

Example: Creating `src/utils/pdfExport.ts` → `CLAUDE.md` 关键文件 table gets a new row.

### 2. File Deleted → Remove from ALL references

When you delete a file, grep the docs for its path and remove/update every reference. A deleted file mentioned in docs is the most common drift.

### 3. File Renamed/Moved → Update ALL path references

When you move or rename a file, find every doc reference to the old path and update it.

### 4. API/Signature Changed → Update usage examples

If a function signature, component props, or config format changes, check if any doc shows usage examples and update them.

### 5. New Dependency → Update "Tech Stack" section

Adding a new npm/cargo dependency? Check if the tech stack list is up to date.

### 6. New Config → Update "Configuration" sections

New fields in config files, new env vars, new build flags → document them.

### 7. Bug Fix with a Story → Add to "Known Issues" or "Notes"

If the fix involved a non-obvious workaround or has an interesting backstory, consider adding to the notes/caveats section.

## How to Update

### Step 1: Identify affected docs

Think: "What docs would someone read to understand this change?" Minimum check: `CLAUDE.md` and root `README.md`.

### Step 2: Read the relevant doc sections

Don't re-read the entire file. Read just the sections that might reference the changed code:
- "关键文件" / "Key Files" / file list tables
- "技术栈" / "Tech Stack"
- "架构" / "Architecture" sections
- "注意事项" / "Notes" / "Gotchas"
- Any section that mentions the specific file or concept you changed

### Step 3: Make minimal, targeted edits

Use Edit (not Write) to update specific lines. Don't rewrite whole sections. Keep changes surgical.

### Step 4: Tell the user

One line summary, e.g.: "Updated CLAUDE.md key files table — added `src/utils/pdfExport.ts`."

## What NOT to Do

- **Don't update docs for trivial changes** — fixing a typo in a string, adjusting CSS by 1px, formatting changes
- **Don't rewrite entire sections** — use Edit for surgical changes
- **Don't add docs for internal-only changes** — if no one else would care, it doesn't need docs
- **Don't touch node_modules or generated docs** — only project-authored .md files

## Decision Framework

Before updating, ask yourself:

1. **Would someone reading the docs be misled** if this change isn't reflected? → MUST update
2. **Is this a new thing that someone should know exists?** → Should add
3. **Is this just an implementation detail** no one needs to know about? → Skip

When in doubt, lean toward updating. Stale docs are worse than no docs.
