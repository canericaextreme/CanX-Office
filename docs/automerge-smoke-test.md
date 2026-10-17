# Guarded auto-merge smoke test

This document exists only to test the guarded auto-merge workflow.

Expected outcome: without an independent approval and passing check run, the pull request remains open. After both gates pass and the explicit `canx:auto-merge` label is present, the scheduled GitHub workflow may merge it without manual intervention.

The smoke test does not authorize changing permissions, policies, application code, or spending.
