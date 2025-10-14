-- Add source_template_id column to workflows table to track which template a workflow was created from
ALTER TABLE workflows
ADD COLUMN source_template_id TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN workflows.source_template_id IS 'The ID of the template this workflow was created from, if any';

-- Add index for faster queries when looking up workflows by template
CREATE INDEX idx_workflows_source_template_id ON workflows(source_template_id);
