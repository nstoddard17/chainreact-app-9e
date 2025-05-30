import requests
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import json

@dataclass
class ChainReactConfig:
    api_key: str
    base_url: str = "https://api.chainreact.dev"

@dataclass
class Workflow:
    id: str
    name: str
    description: Optional[str]
    nodes: List[Any]
    connections: List[Any]
    variables: Optional[Dict[str, Any]]
    configuration: Optional[Dict[str, Any]]
    status: str
    created_at: str
    updated_at: str

@dataclass
class CreateWorkflowRequest:
    name: str
    nodes: List[Any]
    connections: List[Any]
    description: Optional[str] = None
    variables: Optional[Dict[str, Any]] = None
    configuration: Optional[Dict[str, Any]] = None

@dataclass
class PaginatedResponse:
    data: List[Any]
    pagination: Dict[str, int]

@dataclass
class WebhookSubscription:
    id: str
    name: str
    event_types: List[str]
    target_url: str
    is_active: bool
    created_at: str

@dataclass
class CreateWebhookRequest:
    name: str
    event_types: List[str]
    target_url: str
    secret_key: Optional[str] = None
    headers: Optional[Dict[str, str]] = None

class ChainReactSDKError(Exception):
    """Custom exception for ChainReact SDK errors"""
    pass

class ChainReactSDK:
    def __init__(self, config: ChainReactConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {config.api_key}',
            'Content-Type': 'application/json'
        })

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request to ChainReact API"""
        url = f"{self.config.base_url}{endpoint}"
        
        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            try:
                error_data = response.json()
                error_message = error_data.get('error', str(e))
            except:
                error_message = str(e)
            raise ChainReactSDKError(f"API Error: {response.status_code} - {error_message}")
        except requests.exceptions.RequestException as e:
            raise ChainReactSDKError(f"Request Error: {str(e)}")

    # Workflow Management
    def get_workflows(self, page: int = 1, limit: int = 20) -> PaginatedResponse:
        """Get list of workflows"""
        params = {'page': page, 'limit': limit}
        response = self._request('GET', '/api/v1/workflows', params=params)
        return PaginatedResponse(
            data=[Workflow(**workflow) for workflow in response['data']],
            pagination=response['pagination']
        )

    def get_workflow(self, workflow_id: str) -> Workflow:
        """Get a specific workflow by ID"""
        response = self._request('GET', f'/api/v1/workflows/{workflow_id}')
        return Workflow(**response['data'])

    def create_workflow(self, workflow: CreateWorkflowRequest) -> Workflow:
        """Create a new workflow"""
        data = {
            'name': workflow.name,
            'nodes': workflow.nodes,
            'connections': workflow.connections,
        }
        if workflow.description:
            data['description'] = workflow.description
        if workflow.variables:
            data['variables'] = workflow.variables
        if workflow.configuration:
            data['configuration'] = workflow.configuration

        response = self._request('POST', '/api/v1/workflows', json=data)
        return Workflow(**response['data'])

    def update_workflow(self, workflow_id: str, **kwargs) -> Workflow:
        """Update an existing workflow"""
        response = self._request('PUT', f'/api/v1/workflows/{workflow_id}', json=kwargs)
        return Workflow(**response['data'])

    def delete_workflow(self, workflow_id: str) -> None:
        """Delete a workflow"""
        self._request('DELETE', f'/api/v1/workflows/{workflow_id}')

    def execute_workflow(self, workflow_id: str, input_data: Optional[Dict[str, Any]] = None) -> str:
        """Execute a workflow and return execution ID"""
        data = {'input': input_data} if input_data else {}
        response = self._request('POST', f'/api/v1/workflows/{workflow_id}/execute', json=data)
        return response['data']['execution_id']

    # Webhook Management
    def get_webhooks(self) -> List[WebhookSubscription]:
        """Get list of webhook subscriptions"""
        response = self._request('GET', '/api/v1/webhooks')
        return [WebhookSubscription(**webhook) for webhook in response['data']]

    def create_webhook(self, webhook: CreateWebhookRequest) -> WebhookSubscription:
        """Create a new webhook subscription"""
        data = {
            'name': webhook.name,
            'event_types': webhook.event_types,
            'target_url': webhook.target_url,
        }
        if webhook.secret_key:
            data['secret_key'] = webhook.secret_key
        if webhook.headers:
            data['headers'] = webhook.headers

        response = self._request('POST', '/api/v1/webhooks', json=data)
        return WebhookSubscription(**response['data'])

    def update_webhook(self, webhook_id: str, **kwargs) -> WebhookSubscription:
        """Update an existing webhook subscription"""
        response = self._request('PUT', f'/api/v1/webhooks/{webhook_id}', json=kwargs)
        return WebhookSubscription(**response['data'])

    def delete_webhook(self, webhook_id: str) -> None:
        """Delete a webhook subscription"""
        self._request('DELETE', f'/api/v1/webhooks/{webhook_id}')

    # Analytics
    def get_usage_analytics(self, 
                          start_date: Optional[str] = None,
                          end_date: Optional[str] = None,
                          granularity: str = 'day') -> List[Dict[str, Any]]:
        """Get usage analytics data"""
        params = {'granularity': granularity}
        if start_date:
            params['start_date'] = start_date
        if end_date:
            params['end_date'] = end_date

        response = self._request('GET', '/api/v1/analytics/usage', params=params)
        return response['data']

# Example usage
if __name__ == "__main__":
    # Initialize SDK
    config = ChainReactConfig(api_key="your_api_key_here")
    sdk = ChainReactSDK(config)
    
    try:
        # Get workflows
        workflows = sdk.get_workflows(page=1, limit=10)
        print(f"Found {len(workflows.data)} workflows")
        
        # Create a simple workflow
        new_workflow = CreateWorkflowRequest(
            name="Test Workflow",
            description="A test workflow created via SDK",
            nodes=[
                {
                    "id": "trigger",
                    "type": "webhook",
                    "data": {"title": "Webhook Trigger"}
                }
            ],
            connections=[]
        )
        
        created_workflow = sdk.create_workflow(new_workflow)
        print(f"Created workflow: {created_workflow.name}")
        
    except ChainReactSDKError as e:
        print(f"SDK Error: {e}")
