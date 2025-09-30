-- Check what's actually in the templates table
SELECT
    id,
    name,
    is_predefined,
    jsonb_array_length(nodes) as node_count,
    jsonb_array_length(connections) as connection_count,
    workflow_json IS NOT NULL as has_workflow_json,
    nodes->0->'type' as first_node_type,
    nodes->0->'data'->>'type' as first_node_data_type,
    nodes->0->'data'->>'title' as first_node_title
FROM templates
WHERE name LIKE '%AI Agent Test%'
LIMIT 1;

-- Check the structure of the first node
SELECT
    jsonb_pretty(nodes->0) as first_node_structure
FROM templates
WHERE name LIKE '%AI Agent Test%'
LIMIT 1;