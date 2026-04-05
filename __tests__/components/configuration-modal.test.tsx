import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigurationModal } from '../../components/workflows/configuration/ConfigurationModal';

// Mock next/navigation utilities used inside the modal hook stack
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
  useParams: () => ({}),
}));

const stubNodeInfo = {
  type: 'slack_action_send_message',
  title: 'Send Slack Message',
  providerId: 'slack',
  configSchema: [
    { name: 'channel', label: 'Channel', type: 'text', required: true },
    { name: 'message', label: 'Message', type: 'textarea', required: true },
  ],
};

const stubWorkflow = {
  id: 'workflow-1',
  nodes: [
    {
      id: 'trigger-1',
      data: {
        type: 'slack_trigger_new_message',
        isTrigger: true,
        outputSchema: [
          { name: 'channel', label: 'Channel', type: 'text' },
          { name: 'message', label: 'Message', type: 'text' },
        ],
      },
    },
    {
      id: 'action-1',
      data: {
        type: 'slack_action_send_message',
        config: {},
      },
    },
  ],
  edges: [
    { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
  ],
};

describe('ConfigurationModal suggested mappings', () => {
  it('shows suggested mappings banner with correct values', async () => {
    render(
      <ConfigurationModal
        isOpen
        onClose={jest.fn()}
        onSave={jest.fn()}
        onBack={jest.fn()}
        nodeInfo={stubNodeInfo}
        initialData={{}}
        workflowData={stubWorkflow}
        currentNodeId="action-1"
        integrationName="Slack"
      />
    );

    // Banner should render with suggested mappings
    expect(await screen.findByText(/Suggested field mappings/i)).toBeInTheDocument();

    // Verify the suggested mapping values are shown in the banner
    expect(screen.getByText('{{trigger.channel}}')).toBeInTheDocument();
    expect(screen.getByText('{{trigger.message}}')).toBeInTheDocument();

    // Apply button should be present
    expect(screen.getByRole('button', { name: /Fill fields automatically/i })).toBeInTheDocument();
  });

  it('applies suggested mappings on button click', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();

    render(
      <ConfigurationModal
        isOpen
        onClose={jest.fn()}
        onSave={onSave}
        onBack={jest.fn()}
        nodeInfo={stubNodeInfo}
        initialData={{}}
        workflowData={stubWorkflow}
        currentNodeId="action-1"
        integrationName="Slack"
      />
    );

    // Wait for banner to appear
    expect(await screen.findByText(/Suggested field mappings/i)).toBeInTheDocument();

    // Click apply
    await user.click(screen.getByRole('button', { name: /Fill fields automatically/i }));

    // After applying, the suggestions banner should disappear
    // (fields are no longer empty, so autoMappingEntries becomes empty)
    await waitFor(() => {
      expect(screen.queryByText(/Suggested field mappings/i)).not.toBeInTheDocument();
    });
  });
});
