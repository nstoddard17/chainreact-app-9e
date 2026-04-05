import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
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
  it('shows and applies suggested field mappings', async () => {
    const user = userEvent.setup();

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

    // Banner should render with suggested mappings summary
    expect(await screen.findByText(/Suggested field mappings/i)).toBeInTheDocument();

    // Apply suggestions
    await user.click(screen.getByRole('button', { name: /Fill fields automatically/i }));

    // The toast lives in portal; assert by checking new banner copy and field values
    expect(await screen.findByText(/configuration updated/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('{{trigger.channel}}')).toBeInTheDocument();
    expect(screen.getByDisplayValue('{{trigger.message}}')).toBeInTheDocument();
  });
});
