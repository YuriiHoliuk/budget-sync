Read REQUIREMENTS.md, TASKS.json, LEARNINGS.md.

You should build the full feature, including infrastructure, local changes. You should build it, test it, verify it, and so on. You shouldn't ask the user; you should do all the work and make the needed decisions. Commit. When it works locally fully, you should output an exit signal. Later, the user will test, and then we will commit and work on verified GCP infrastructure.
We do the job in the Ralph loop, and here you are in the one iteration. In this iteration, you should take tasks to implement, or if there are no tasks, you need to decompose or if the tasks are too big, you need to decompose and create more tasks.
Use front-end designer skills when working on UI.
You should do one thing and finish work. If during iteration you had something important for the future iterations (some learning or key resources to mention), write it to the learning markdown file but keep it clean and concise.
Write concise changes in iteration to CHANGELOG.md

When you think feature as 100% fully implemented, works correctly locally, deploys correctly, covered with all kind of tests, everything work correctly during manual testing, code follows project guidelines and there is nothing to do - output RALPH_EXIT_SIGNAL.
IMPORTANT: Need to output RALPH_EXIT_SIGNAL only if EVERY task is completed and nothing to decompose, nothing to do, etc. NOT when you completed one task - in this case you should just finish work without signal.
