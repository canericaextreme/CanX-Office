# Routine Office task wording — 24 October 2026

John should not need a magic phrase. The request parser accepts clear variations
for continuing an exact saved task, while the executor still checks the owner,
current task state, previous attempts, risk, protected scope and budget.

| Phrase family | Intended route | Boundary |
| --- | --- | --- |
| Finish this task / Finish loop test PR230 | Existing-task intent | Does not create a new build or invent task scope |
| Continue the fix / Resume the saved task | Existing-task intent | Existing attempt is checked; never resubmitted |
| Carry on with that job / Keep working on the repair | Existing-task intent | Exact task must be resolved by the normal task tool |
| Get the fix done | Existing-task intent | Protected or completed tasks remain protected/closed |
| Elsie, could you start a new Codex build to fix the label? | Explicit build intent | Named builder, green scope, budget and no-retry checks remain |
| Is the task finished? / Explain how to finish the task | Status/discussion | No execution intent |
| Finish the task, but do not send it yet | Stop/discussion | Explicit stop wins |

Spoken openers such as Okay and Yeah retain their established normalization.
Polite explicit build questions use the same command grammar, replacing a broken
escaped-regex clause search; arbitrary mentions of starting a build are not
commands. These are parser regression results, not a claim that a live provider
or the whole Office passed.

Wording failures and provider failures are tracked separately. HTTP429 is not
permission to change budgets or retry blindly. The provider diagnostic retains
only allowlisted rate/credit/spend/usage codes and type, plus a bounded numeric
Retry-After value when supplied. Raw provider messages and credentials are never
saved. No automatic provider retry or limit increase is introduced.
