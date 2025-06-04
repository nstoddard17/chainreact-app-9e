import type React from "react"
import ScopeValidationAlert from "./ScopeValidationAlert"

const IntegrationsContent: React.FC = () => {
  return (
    <div>
      <ScopeValidationAlert />
      {/* rest of the integrations content will go here */}
      <h1>Integrations Content</h1>
      <p>This is the integrations content section.</p>
    </div>
  )
}

export default IntegrationsContent
