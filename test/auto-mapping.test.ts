import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAutoMappingEntries,
  sanitizeAlias,
  extractNodeOutputs,
  applyAutoMappingSuggestions,
} from '../components/workflows/configuration/autoMapping';

const baseWorkflow = {
  id: 'workflow-1',
  nodes: [
    {
      id: 'trigger-1',
      data: {
        type: 'slack_trigger_new_message',
        label: 'Slack Trigger',
        outputSchema: [
          { name: 'channel', type: 'text' },
          { name: 'message', type: 'text' },
          { name: 'timestamp', type: 'number' },
        ],
      },
    },
    {
      id: 'action-1',
      data: {
        type: 'slack_action_send_message',
      },
    },
  ],
  edges: [
    { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
  ],
};

const slackConfigSchema = [
  { name: 'channel', label: 'Channel', type: 'text', required: true },
  { name: 'message', label: 'Message', type: 'textarea', required: true },
  { name: '__internal', label: 'Internal', type: 'text' },
];

const extractConfigSchema = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
];

const extractOutputs = [
  { name: 'primary_name', type: 'text' },
  { name: 'primary_email', type: 'email' },
  { name: 'notes', type: 'text' },
];

const extractWorkflow = {
  id: 'workflow-2',
  nodes: [
    {
      id: 'trigger-2',
      data: {
        type: 'airtable_trigger',
        label: 'Airtable Trigger',
        outputSchema: extractOutputs,
      },
    },
    {
      id: 'action-2',
      data: {
        type: 'auto_mapper_action',
      },
    },
  ],
  edges: [
    { id: 'edge-2', source: 'trigger-2', target: 'action-2' },
  ],
};

test('sanitizeAlias normalises names', () => {
  assert.equal(sanitizeAlias('My Trigger!'), 'My_Trigger_');
  assert.equal(sanitizeAlias('   '), 'step');
  assert.equal(sanitizeAlias(undefined), 'step');
});

test('extractNodeOutputs picks the best available schema', () => {
  const node = { data: { outputSchema: [{ name: 'field' }] } };
  assert.deepEqual(extractNodeOutputs(node), [{ name: 'field' }]);

  const fallbackNode = { data: { nodeComponent: { outputSchema: [{ name: 'fallback' }] } } };
  assert.deepEqual(extractNodeOutputs(fallbackNode), [{ name: 'fallback' }]);

  const configFallbackNode = { data: { config: { outputSchema: [{ name: 'config' }] } } };
  assert.deepEqual(extractNodeOutputs(configFallbackNode), [{ name: 'config' }]);
});

test('computeAutoMappingEntries suggests missing Slack fields', () => {
  const entries = computeAutoMappingEntries({
    workflowData: baseWorkflow,
    currentNodeId: 'action-1',
    configSchema: slackConfigSchema,
    currentConfig: {},
  });

  const mapping = Object.fromEntries(entries.map((entry) => [entry.fieldKey, entry.value]));
  const alias = sanitizeAlias('Slack Trigger');
  assert.equal(mapping.channel, `{{${alias}.channel}}`);
  assert.equal(mapping.message, `{{${alias}.message}}`);
  assert(!mapping.__internal, 'internal fields should be ignored');
});

test('computeAutoMappingEntries preserves existing values', () => {
  const entries = computeAutoMappingEntries({
    workflowData: baseWorkflow,
    currentNodeId: 'action-1',
    configSchema: slackConfigSchema,
    currentConfig: { channel: 'marketing-team', message: '' },
  });

  const mapping = Object.fromEntries(entries.map((entry) => [entry.fieldKey, entry.value]));
  const alias = sanitizeAlias('Slack Trigger');
  assert(!mapping.channel, 'pre-populated fields should not be replaced');
  assert.equal(mapping.message, `{{${alias}.message}}`, 'empty field should still receive suggestion');
});

test('computeAutoMappingEntries leans on field type when names differ', () => {
  const entries = computeAutoMappingEntries({
    workflowData: extractWorkflow,
    currentNodeId: 'action-2',
    configSchema: extractConfigSchema,
    currentConfig: {},
  });

  const mapping = Object.fromEntries(entries.map((entry) => [entry.fieldKey, entry.value]));
  const alias = sanitizeAlias('Airtable Trigger');
  assert.equal(mapping.name, `{{${alias}.primary_name}}`);
  assert.equal(mapping.email, `{{${alias}.primary_email}}`);
});

test('applyAutoMappingSuggestions fills only empty fields', () => {
  const config = {
    channel: 'marketing',
    message: ''
  };

  const entries = [
    { fieldKey: 'channel', fieldLabel: 'Channel', value: 'override-channel' },
    { fieldKey: 'message', fieldLabel: 'Message', value: '{{trigger.body}}' }
  ];

  const result = applyAutoMappingSuggestions({ config, entries });

  assert.equal(result.channel, 'marketing', 'existing values remain untouched');
  assert.equal(result.message, '{{trigger.body}}', 'blank values get suggestions applied');
});
