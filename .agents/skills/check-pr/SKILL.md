---
name: check-pr
description: Review the latest pull request in github for unresolved reviewer comments, including Codex comments, evaluate whether they are necessary, and ask the user which ones should be resolved.
---

Review the most recent pull request for the current branch.

1. Find all unresolved review comments, including comments from human reviewers, bots, and Codex.
2. Inspect the relevant code and evaluate whether each comment is necessary.
3. Present a short numbered summary with the reviewer, file, requested change, evaluation, and recommendation.
4. Ask the user which comments should be resolved.
5. Do not modify code until the user approves specific comments.
6. For approved comments:
   - Implement the required changes.
   - Run the relevant tests and checks.
   - Commit and push the changes to the current PR branch.
   - Reply to each comment explaining what was changed.
   - Mark the corresponding review thread as resolved.
7. Do not merge the pull request.
