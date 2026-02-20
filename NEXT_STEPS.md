# Next Steps

This file is a lightweight, current checklist for keeping the app healthy. It replaces an older, outdated migration summary.

## Database
- Confirm migrations are applied in the target environment.
- Ensure critical tables exist and RLS policies match the runtime client:
  - `workflow_execution_sessions`
  - `execution_steps`

Suggested verification:
```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('workflow_execution_sessions', 'execution_steps');

select count(*) as executions
from workflow_execution_sessions;

select count(*) as steps
from execution_steps;
```

## App Smoke Test
Run the dev server and check basic flows:
```bash
npm run dev
```

Checklist:
- Create and run a workflow.
- Open execution history and verify steps render.
- Verify errors show in history for a failing step.

## CI/CD (Optional)
If you use automated DB deploys:
- Ensure migrations are committed.
- Verify pipeline uses the correct Supabase project.

---

Last updated: 2026-02-20
