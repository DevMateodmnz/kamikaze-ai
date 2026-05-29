# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

## User Skills

| Trigger                    | Skill                | Path                                                              |
| -------------------------- | -------------------- | ----------------------------------------------------------------- |
| work unit commits, commit splitting | work-unit-commits   | /home/mateo/.config/opencode/skills/work-unit-commits/SKILL.md    |
| comment feedback, PR reply, GitHub comment | comment-writer      | /home/mateo/.config/opencode/skills/comment-writer/SKILL.md       |
| design docs, guides, READMEs, RFCs | cognitive-doc-design | /home/mateo/.config/opencode/skills/cognitive-doc-design/SKILL.md  |
| PR over 400 lines, stacked PRs, review slices | chained-pr          | /home/mateo/.config/opencode/skills/chained-pr/SKILL.md            |
| create issue, bug report, feature request | issue-creation      | /home/mateo/.config/opencode/skills/issue-creation/SKILL.md       |
| create pull request, PR review | branch-pr             | /home/mateo/.config/opencode/skills/branch-pr/SKILL.md            |
| new skill, agent instructions | skill-creator         | /home/mateo/.config/opencode/skills/skill-creator/SKILL.md        |
| Go tests, go test coverage, golden files | go-testing           | /home/mateo/.config/opencode/skills/go-testing/SKILL.md            |
| judgment day, dual review, adversarial review | judgment-day        | /home/mateo/.config/opencode/skills/judgment-day/SKILL.md          |

## Compact Rules

### work-unit-commits

- Split implementation into reviewable commits: one concern per commit, tests + docs co-located with code
- Size cap: ~400 lines max per commit; over that, chain with `Depends-On:` trailer
- Never commit generated files, secrets, node_modules, dist, or binary assets
- Commit message format: `type(scope): description` (conventional commits)
- Squash only during review feedback, never as a batch operation
- The commit that closes a PR should be a merge commit or a descriptive fixup

### comment-writer

- Lead with what matters to the author — specific, actionable, kind
- Distinguish blocking (must fix) from non-blocking (could improve) feedback explicitly
- Offer alternatives, not just criticism — show the correct way, not just the wrong way
- For nitpicks, mark them as optional — don't make authors chase perfection on trivial things
- Use code blocks with language tags; highlight the exact lines you're referencing with line numbers

### cognitive-doc-design

- Lead with the decision, not the background — invert pyramid structure
- Chunk into 5-line max paragraphs with clear headings; avoid walls of text
- Use tables for comparisons, diagrams only when words can't convey it
- Every heading should be a complete thought the reader can act on
- Append "Why" section only if it aids understanding; otherwise cut
- Include a TL;DR at top for long docs

### chained-pr

- First PR in chain: always the smallest, most foundational change (types, interfaces, test infra)
- Each subsequent PR depends on the previous via `Depends-On:` header
- Chain order must respect dependency direction — no forward references
- Keep each PR under 400 lines; if it grows, split again
- Mark chain as draft until all pieces are reviewable

### issue-creation

- Issue title: one sentence, specific, describes the bug or missing behavior (not the solution)
- Body must have: Steps to Reproduce, Expected Behavior, Actual Behavior, Environment
- For features: describe user journey, not implementation details
- Label with type: bug / feature / chore / docs
- First comment should be a self-contained summary with severity and effort estimate

### branch-pr

- Create branch from latest main; name format: `type/ticket-description` (e.g., `fix/auth-token-expiry`)
- PR title mirrors issue title; body includes context, what changed, and how to test
- Keep diff reviewer-focused: no refactors mixed with bug fixes unless unavoidable
- CI must pass before merge; at least one approval required
- Never force-push to main or shared branches

### skill-creator

- SKILL.md must have: frontmatter (name, description, license, metadata), Activation Contract, Hard Rules, Decision Gates, Execution Steps, Output Contract, References
- description field: one physical line, trigger-first, under 250 chars
- Execution Steps must be sequence-numbered, observable, non-overlapping
- Output Contract must specify exact return shape
- Keep body 180-450 tokens; move examples and schemas to local `references/` or `assets/`

### go-testing

- Test file lives next to implementation: `foo.go` → `foo_test.go`
- Table-driven tests for all branches; use `t.Run` for clarity
- Golden files for complex output; update with `go test -update`
- Never use `time.Sleep` for synchronization; use `assert.Eventually` or a clock
- Coverage threshold: 80% minimum for new code
- Mock interfaces at the boundary, not internals

### judgment-day

- Two agents review independently, no discussion before verdicts
- Agent A: walk the change as if implementing it — does it solve the problem completely?
- Agent B: walk the change as if trying to break it — where does it fail?
- Log all findings; merge after both are done
- Fix confirmed issues first; re-judge only confirmed bugs, not style preferences
- Blocking verdict: both agents agree the change introduces a regression or security flaw

## Project Conventions

| File   | Path   | Notes   |
| ------ | ------ | ------- |
| —      | —      | No convention files detected in project root |

Read the convention files listed above for project-specific patterns and rules.