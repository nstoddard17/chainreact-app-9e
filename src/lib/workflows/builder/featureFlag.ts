/**
 * Flow V2 Feature Flags
 *
 * Flow V2 is now the default and always enabled.
 * These functions are kept for backward compatibility but always return true.
 */

export function isFlowV2Backend(): boolean {
  return true
}

export function isFlowV2Frontend(): boolean {
  return true
}

export const isFlowV2Enabled = isFlowV2Backend
export const isFlowV2FrontendEnabled = isFlowV2Frontend

/**
 * @deprecated Flow V2 is always enabled. This function is kept for backward compatibility.
 */
export function flowV2DisabledResponseBody() {
  return {
    ok: false,
    error: "Flow v2 is currently disabled",
    code: "flow_v2_disabled",
  }
}
