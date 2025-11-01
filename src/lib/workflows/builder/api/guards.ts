import { NextResponse } from "next/server"

import { flowV2DisabledResponseBody, isFlowV2Enabled } from "../featureFlag"

export function guardFlowV2Enabled() {
  if (!isFlowV2Enabled()) {
    return NextResponse.json(flowV2DisabledResponseBody(), { status: 404 })
  }
  return null
}
