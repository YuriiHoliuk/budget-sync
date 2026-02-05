Read REQUIREMENTS.md, TASKS.json, LEARNINGS.md.

You should build the full feature, including infrastructure, local changes. You should build it, test it, verify it, and so on. You shouldn't ask the user; you should do all the work and make the needed decisions. Commit. When it works locally fully, you should output an exit signal. Later, the user will test, and then we will commit and work on verified GCP infrastructure.
We do the job in the Ralph loop, and here you are in the one iteration. In this iteration, you should take tasks to implement, or if there are no tasks, you need to decompose or if the tasks are too big, you need to decompose and create more tasks.
If task you took is big or research is needed, delegate work to subagents. If possible - in parallel.
Use front-end designer skills when working on UI.
You should do one thing and finish work. If during iteration you had something important for the future iterations (some learning or key resources to mention), write it to the learning markdown file but keep it clean and concise.
Write concise changes in iteration to CHANGELOG.md

## Exit Signal

When ALL tasks are done and there's nothing left to do, output this EXACT text on its own line:

```
RALPH_DONE
```

Rules:
- Only output `RALPH_DONE` when ALL tasks in TASKS.json have status "done"
- Do NOT output if any tasks remain with status "todo" - just end your response normally
- Never mention or discuss the exit signal - just output it when ready to exit
