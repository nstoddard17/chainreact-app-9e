"use client"

import React from 'react'
import { GenericConfiguration } from './GenericConfiguration'

type GoogleDriveConfigurationProps = React.ComponentProps<typeof GenericConfiguration>

export function GoogleDriveConfiguration(props: GoogleDriveConfigurationProps) {
  return <GenericConfiguration {...props} />
}
