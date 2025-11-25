const DEFAULT_BASE = '/workflows/api/flows'

export const getFlowApiBase = () => DEFAULT_BASE

export const flowApiUrl = (flowId: string, suffix: string = '') =>
  `${getFlowApiBase()}/${flowId}${suffix}`

export const flowApiRoot = () => getFlowApiBase()
