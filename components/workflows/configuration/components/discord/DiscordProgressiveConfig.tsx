"use client"

import React from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FieldRenderer } from "../../fields/FieldRenderer";
import { DiscordReactionSelector } from "../../fields/discord/DiscordReactionSelector";
import { shouldHideField } from "../../utils/validation";

interface DiscordProgressiveConfigProps {
  nodeInfo: any;
  values: Record<string, any>;
  errors: Record<string, string>;
  discordIntegration: any;
  botStatus: { isInGuild: boolean; hasPermissions: boolean } | null;
  isBotStatusChecking: boolean;
  isBotConnectionInProgress: boolean;
  loadingFields: Set<string>;
  dynamicOptions: Record<string, any[]>;
  handleFieldChange: (fieldName: string, value: any) => void;
  handleConnectDiscord: () => void;
  handleInviteBot: (guildId: string) => void;
  handleAddBotToServer: (guildId: string) => void;
  handleDynamicLoad: (fieldName: string) => void;
  workflowData?: any;
  currentNodeId?: string;
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any) => Promise<void>;
}

export function DiscordProgressiveConfig({
  nodeInfo,
  values,
  errors,
  discordIntegration,
  botStatus,
  isBotStatusChecking,
  isBotConnectionInProgress,
  loadingFields,
  dynamicOptions,
  handleFieldChange,
  handleConnectDiscord,
  handleInviteBot,
  handleAddBotToServer,
  handleDynamicLoad,
  workflowData,
  currentNodeId,
  loadOptions
}: DiscordProgressiveConfigProps) {
  const guildField = nodeInfo?.configSchema?.find((field: any) => field.name === 'guildId');
  const channelField = nodeInfo?.configSchema?.find((field: any) => field.name === 'channelId');
  
  // Step 1: Show connection prompt if Discord is not connected
  if (!discordIntegration) {
    return (
      <ScrollArea className="h-[calc(90vh-180px)] pr-4">
        <div className="space-y-4 p-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-800">Connect Discord</h3>
            <p className="text-sm text-blue-700 mt-1">
              Connect your Discord account to configure this action and access your servers.
            </p>
            <Button
              variant="default"
              className="mt-3 text-sm bg-[#5865F2] hover:bg-[#4752C4] text-white"
              onClick={handleConnectDiscord}
              disabled={loadingFields.has('guildId')}
            >
              {loadingFields.has('guildId') ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Connecting...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0190 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z"/>
                  </svg>
                  Connect Discord
                </div>
              )}
            </Button>
          </div>
        </div>
      </ScrollArea>
    );
  }

  // Step 2: Show only server field initially
  if (guildField && !values.guildId) {
    return (
      <ScrollArea className="h-[calc(90vh-180px)] pr-4">
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has('guildId')}
            onDynamicLoad={handleDynamicLoad}
            nodeInfo={nodeInfo}
          />
        </div>
      </ScrollArea>
    );
  }

  // For actions without channel field (like create category, fetch members), show remaining fields after server selection
  if (!channelField && values.guildId && botStatus?.isInGuild && botStatus?.hasPermissions) {
    // Get all fields except guildId (already shown)
    const remainingFields = nodeInfo?.configSchema?.filter((field: any) => 
      field.name !== 'guildId' && 
      !shouldHideField(field, values)
    ) || [];

    return (
      <ScrollArea className="h-[calc(90vh-180px)] pr-4">
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has('guildId')}
            onDynamicLoad={handleDynamicLoad}
            nodeInfo={nodeInfo}
          />
          
          {/* Show remaining fields */}
          {remainingFields.map((field: any) => (
            <FieldRenderer
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={(value) => handleFieldChange(field.name, value)}
              error={errors[field.name]}
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingFields.has(field.name)}
              nodeInfo={nodeInfo}
              onDynamicLoad={handleDynamicLoad}
            />
          ))}
        </div>
      </ScrollArea>
    );
  }

  // Step 3: Server selected - check bot connection status
  if (values.guildId && (!botStatus || isBotStatusChecking)) {
    // Bot status checking or not started yet
    return (
      <ScrollArea className="h-[calc(90vh-180px)] pr-4">
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has('guildId')}
            onDynamicLoad={handleDynamicLoad}
            nodeInfo={nodeInfo}
          />
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"></div>
              <span className="text-sm text-gray-700">Checking bot connection status...</span>
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }

  // Bot not connected - show connect button
  if (values.guildId && botStatus && !botStatus.isInGuild) {
    return (
      <ScrollArea className="h-[calc(90vh-180px)] pr-4">
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has('guildId')}
            onDynamicLoad={handleDynamicLoad}
            nodeInfo={nodeInfo}
          />
          
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-orange-800">Bot Connection Required</h3>
            <p className="text-sm text-orange-700 mt-1">
              The Discord bot needs to be added to this server to use Discord actions. Click the button below to add the bot.
            </p>
            
            <Button
              type="button"
              variant="default"
              className="mt-3 text-sm bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => channelField ? handleInviteBot(values.guildId) : handleAddBotToServer(values.guildId)}
              disabled={isBotConnectionInProgress}
            >
              {isBotConnectionInProgress ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  {channelField ? 'Connecting Bot...' : 'Adding Bot...'}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0190 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z"/>
                  </svg>
                  {channelField ? 'Connect Bot to Server' : 'Add Bot to Server'}
                </div>
              )}
            </Button>
          </div>
        </div>
      </ScrollArea>
    );
  }

  // Bot connected but lacks permissions - show reconnect button
  if (values.guildId && botStatus?.isInGuild && !botStatus.hasPermissions) {
    return (
      <ScrollArea className="h-[calc(90vh-180px)] pr-4">
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has('guildId')}
            onDynamicLoad={handleDynamicLoad}
            nodeInfo={nodeInfo}
          />
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-yellow-800">Bot Needs Additional Permissions</h3>
            <p className="text-sm text-yellow-700 mt-1">
              The Discord bot is connected to this server but needs additional permissions{channelField ? ' to view channels' : ''}. Click the button below to update bot permissions.
            </p>
            
            <Button
              type="button"
              variant="default"
              className="mt-3 text-sm bg-yellow-600 hover:bg-yellow-700 text-white"
              onClick={() => channelField ? handleInviteBot(values.guildId) : handleAddBotToServer(values.guildId)}
              disabled={isBotConnectionInProgress}
            >
              {isBotConnectionInProgress ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Updating Permissions...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                  </svg>
                  Update Bot Permissions
                </div>
              )}
            </Button>
          </div>
        </div>
      </ScrollArea>
    );
  }

  // Bot connected with permissions, show server and channel fields
  if (values.guildId && botStatus?.isInGuild && botStatus?.hasPermissions && channelField && !values.channelId) {
    return (
      <ScrollArea className="h-[calc(90vh-180px)] pr-4">
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has('guildId')}
            onDynamicLoad={handleDynamicLoad}
            nodeInfo={nodeInfo}
          />
          
          {/* Always show channel field - it will handle its own loading state */}
          <FieldRenderer
            field={channelField}
            value={values.channelId || ""}
            onChange={(value) => handleFieldChange('channelId', value)}
            error={errors.channelId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has('channelId')}
            onDynamicLoad={handleDynamicLoad}
            nodeInfo={nodeInfo}
          />
        </div>
      </ScrollArea>
    );
  }

  // Channel selected, show all remaining fields
  if (values.guildId && values.channelId) {
    // Get all fields except guildId and channelId (already shown)
    // For remove reaction actions, also exclude emoji field as it will be handled by DiscordReactionSelector
    const remainingFields = nodeInfo?.configSchema?.filter((field: any) => 
      field.name !== 'guildId' && 
      field.name !== 'channelId' && 
      !(nodeInfo?.type === 'discord_action_remove_reaction' && field.name === 'emoji')
    ) || [];
    
    return (
      <ScrollArea className="h-[calc(90vh-180px)] pr-4">
        <div className="space-y-6 p-4">
          <FieldRenderer
            field={guildField}
            value={values.guildId || ""}
            onChange={(value) => handleFieldChange('guildId', value)}
            error={errors.guildId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has('guildId')}
            onDynamicLoad={handleDynamicLoad}
            nodeInfo={nodeInfo}
          />
          
          <FieldRenderer
            field={channelField}
            value={values.channelId || ""}
            onChange={(value) => handleFieldChange('channelId', value)}
            error={errors.channelId}
            dynamicOptions={dynamicOptions}
            loadingDynamic={loadingFields.has('channelId')}
            onDynamicLoad={handleDynamicLoad}
            nodeInfo={nodeInfo}
          />
          
          {/* Render remaining fields */}
          {remainingFields.map((field: any, index: number) => (
            <React.Fragment key={`discord-field-${field.name}-${index}`}>
              <FieldRenderer
                field={field}
                value={values[field.name]}
                onChange={(value) => handleFieldChange(field.name, value)}
                error={errors[field.name]}
                workflowData={workflowData}
                currentNodeId={currentNodeId}
                dynamicOptions={dynamicOptions}
                loadingDynamic={loadingFields.has(field.name)}
                nodeInfo={nodeInfo}
                onDynamicLoad={handleDynamicLoad}
              />
              
              {/* Show Discord Reaction Selector after messageId field for remove reaction actions */}
              {field.name === 'messageId' && nodeInfo?.type === 'discord_action_remove_reaction' && values.messageId && values.channelId && (
                <DiscordReactionSelector
                  channelId={values.channelId}
                  messageId={values.messageId}
                  selectedEmoji={values.emoji}
                  onSelect={(emojiValue) => handleFieldChange('emoji', emojiValue)}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </ScrollArea>
    );
  }

  // Fallback - shouldn't reach here but show basic fields if we do
  return (
    <div className="space-y-6 p-4">
      {nodeInfo?.configSchema?.map((field: any, index: number) => (
        <FieldRenderer
          key={`fallback-field-${field.name}-${index}`}
          field={field}
          value={values[field.name]}
          onChange={(value) => handleFieldChange(field.name, value)}
          error={errors[field.name]}
          workflowData={workflowData}
          currentNodeId={currentNodeId}
          dynamicOptions={dynamicOptions}
          loadingDynamic={loadingFields.has(field.name)}
          nodeInfo={nodeInfo}
          allValues={values}
          onDynamicLoad={loadOptions}
        />
      )) || []}
    </div>
  );
}