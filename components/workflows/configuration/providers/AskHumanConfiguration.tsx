"use client"

import { useMemo, useCallback } from 'react'
import { DiscordConfiguration, DiscordConfigurationProps } from './DiscordConfiguration'

export function AskHumanConfiguration(props: DiscordConfigurationProps) {
  const {
    nodeInfo,
    values,
    setValue,
    errors,
    dynamicOptions,
    loadOptions,
    loadingFields,
    onSubmit,
    ...rest
  } = props

  const toDiscordFieldName = (fieldName?: string | null) => {
    if (!fieldName) return fieldName as any
    if (fieldName === 'guildId') return 'discordGuildId'
    if (fieldName === 'channelId') return 'discordChannelId'
    return fieldName
  }

  const toNormalizedFieldName = (fieldName?: string | null) => {
    if (!fieldName) return fieldName as any
    if (fieldName === 'discordGuildId') return 'guildId'
    if (fieldName === 'discordChannelId') return 'channelId'
    return fieldName
  }

  const normalizedNodeInfo = useMemo(() => {
    if (!nodeInfo) return nodeInfo

    const remappedSchema = nodeInfo.configSchema?.map((field: any) => {
      const remappedName = toNormalizedFieldName(field.name)
      const remappedDependsOn = toNormalizedFieldName(field.dependsOn)
      return {
        ...field,
        name: remappedName,
        dependsOn: remappedDependsOn
      }
    })

    return {
      ...nodeInfo,
      providerId: 'discord',
      configSchema: remappedSchema
    }
  }, [nodeInfo])

  const normalizedValues = useMemo(() => ({
    ...values,
    guildId: values?.discordGuildId ?? values?.guildId ?? '',
    channelId: values?.discordChannelId ?? values?.channelId ?? ''
  }), [values])

  const normalizedErrors = useMemo(() => ({
    ...errors,
    guildId: errors?.discordGuildId ?? errors?.guildId,
    channelId: errors?.discordChannelId ?? errors?.channelId
  }), [errors])

  const normalizedDynamicOptions = useMemo(() => ({
    ...dynamicOptions,
    guildId: dynamicOptions?.discordGuildId || dynamicOptions?.guildId || [],
    channelId: dynamicOptions?.discordChannelId || dynamicOptions?.channelId || []
  }), [dynamicOptions])

  const normalizedLoadingFields = useMemo(() => {
    if (!loadingFields) return loadingFields
    const mapped = new Set(loadingFields)
    if (loadingFields.has('discordGuildId')) mapped.add('guildId')
    if (loadingFields.has('discordChannelId')) mapped.add('channelId')
    return mapped
  }, [loadingFields])

  const handleSetValue = useCallback((fieldName: string, value: any) => {
    setValue(toDiscordFieldName(fieldName), value)
  }, [setValue])

  const handleLoadOptions = useCallback((
    fieldName: string,
    parentField?: string,
    parentValue?: any,
    forceReload?: boolean,
    silent?: boolean,
    extraOptions?: Record<string, any>
  ) => {
    return loadOptions(
      toDiscordFieldName(fieldName),
      toDiscordFieldName(parentField),
      parentValue,
      forceReload,
      silent,
      extraOptions
    )
  }, [loadOptions])

  const handleSubmit = useCallback(async (formValues: Record<string, any>) => {
    const { guildId, channelId, ...restValues } = formValues
    console.log('🔧 [AskHumanConfig] handleSubmit received:', { guildId, channelId, restValues, hasValidationState: !!restValues.__validationState })
    await onSubmit({
      ...restValues,
      discordGuildId: guildId,
      discordChannelId: channelId
    })
  }, [onSubmit])

  return (
    <DiscordConfiguration
      {...rest}
      nodeInfo={normalizedNodeInfo}
      values={normalizedValues}
      setValue={handleSetValue}
      errors={normalizedErrors}
      dynamicOptions={normalizedDynamicOptions}
      loadOptions={handleLoadOptions}
      loadingFields={normalizedLoadingFields}
      onSubmit={handleSubmit}
    />
  )
}
