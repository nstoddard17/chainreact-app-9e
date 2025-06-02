import IntegrationDebug from "./IntegrationDebug"

const IntegrationsContent = () => {
  return (
    <div>
      {/* Main content of the IntegrationsContent component */}
      <h1>Integrations Content</h1>
      <p>This is the main content area for integrations.</p>

      {process.env.NODE_ENV === "development" && <IntegrationDebug />}
    </div>
  )
}

export default IntegrationsContent
