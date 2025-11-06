"use client"

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { logger } from '@/lib/utils/logger';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';

interface SlashCommandManagerProps {
  guildId: string;
  commandName: string;
  commandDescription?: string;
  commandOptions?: any[];
  onCommandNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onOptionsChange?: (value: any[]) => void;
  integrationId: string;
}

export function SlashCommandManager({
  guildId,
  commandName,
  commandDescription = '',
  commandOptions = [],
  onCommandNameChange,
  onDescriptionChange,
  onOptionsChange,
  integrationId
}: SlashCommandManagerProps) {
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const { toast } = useToast();

  // Validate command name (Discord rules)
  const validateCommandName = (name: string): { valid: boolean; error?: string } => {
    if (!name) {
      return { valid: false, error: 'Command name is required' };
    }
    if (name.length < 1 || name.length > 32) {
      return { valid: false, error: 'Command name must be 1-32 characters' };
    }
    if (!/^[a-z0-9_-]+$/.test(name)) {
      return { valid: false, error: 'Command name must be lowercase, alphanumeric, hyphens, or underscores only' };
    }
    if (name.startsWith('/')) {
      return { valid: false, error: 'Do not include "/" prefix' };
    }
    return { valid: true };
  };

  const validation = validateCommandName(commandName);

  // Check if command exists
  const checkCommandStatus = async () => {
    if (!guildId || !commandName || !validation.valid) {
      setIsRegistered(null);
      return;
    }

    setIsChecking(true);
    try {
      const response = await fetch(`/api/discord/slash-commands/check?guildId=${guildId}&commandName=${commandName}&integrationId=${integrationId}`);
      const data = await response.json();

      setIsRegistered(data.exists || false);
    } catch (error: any) {
      logger.error('[SlashCommandManager] Error checking command status:', error);
      setIsRegistered(null);
    } finally {
      setIsChecking(false);
    }
  };

  // Check status when guildId or commandName changes
  useEffect(() => {
    checkCommandStatus();
  }, [guildId, commandName]);

  // Create command
  const handleCreate = async () => {
    if (!validation.valid) {
      toast({
        title: 'Invalid Command Name',
        description: validation.error,
        variant: 'destructive'
      });
      return;
    }

    if (!commandDescription) {
      toast({
        title: 'Description Required',
        description: 'Please provide a command description',
        variant: 'destructive'
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/discord/slash-commands/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId,
          commandName,
          description: commandDescription,
          options: commandOptions,
          integrationId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create command');
      }

      setIsRegistered(true);
      toast({
        title: 'Command Created',
        description: `/${commandName} is now available in your Discord server`
      });

      // Refresh status
      await checkCommandStatus();
    } catch (error: any) {
      logger.error('[SlashCommandManager] Error creating command:', error);
      toast({
        title: 'Creation Failed',
        description: error.message || 'Failed to create slash command',
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Delete command
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/discord/slash-commands/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId,
          commandName,
          integrationId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete command');
      }

      setIsRegistered(false);
      toast({
        title: 'Command Deleted',
        description: `/${commandName} has been removed from your Discord server`
      });

      // Refresh status
      await checkCommandStatus();
    } catch (error: any) {
      logger.error('[SlashCommandManager] Error deleting command:', error);
      toast({
        title: 'Deletion Failed',
        description: error.message || 'Failed to delete slash command',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="p-4 space-y-4 bg-card border-border">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Slash Command Setup</Label>
        <p className="text-xs text-muted-foreground">
          Create a Discord slash command that will trigger this workflow when used in your server.
        </p>
      </div>

      {/* Command Name */}
      <div className="space-y-2">
        <Label htmlFor="commandName" className="text-sm">
          Command Name <span className="text-red-500">*</span>
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">/</span>
          <Input
            id="commandName"
            value={commandName}
            onChange={(e) => onCommandNameChange(e.target.value.toLowerCase())}
            placeholder="my-command"
            className={!validation.valid && commandName ? 'border-red-500' : ''}
          />
        </div>
        {!validation.valid && commandName && (
          <p className="text-xs text-red-500">{validation.error}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Lowercase, alphanumeric, hyphens, or underscores only (1-32 chars)
        </p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="commandDescription" className="text-sm">
          Description <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="commandDescription"
          value={commandDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="What does this command do?"
          className="h-20"
          maxLength={100}
        />
        <p className="text-xs text-muted-foreground">
          Shown in Discord's UI when users browse commands ({commandDescription.length}/100)
        </p>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          {isChecking ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking...
            </Badge>
          ) : isRegistered === true ? (
            <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle2 className="h-3 w-3" />
              Registered
            </Badge>
          ) : isRegistered === false ? (
            <Badge variant="outline" className="gap-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              <AlertTriangle className="h-3 w-3" />
              Not Registered
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <XCircle className="h-3 w-3" />
              Unknown
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {isRegistered ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || !guildId}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Command
                </>
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isCreating || !validation.valid || !commandDescription || !guildId}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Create Command
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Info Message */}
      {!guildId && (
        <div className="flex items-start gap-2 p-3 rounded-lg border bg-blue-500/10 border-blue-500/20">
          <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5" />
          <div className="text-xs text-blue-600">
            Please select a Discord server first to create slash commands.
          </div>
        </div>
      )}

      {isRegistered && (
        <div className="flex items-start gap-2 p-3 rounded-lg border bg-green-500/10 border-green-500/20">
          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
          <div className="text-xs text-green-600">
            This command is registered and will appear in your Discord server's slash command menu.
            Users can type <code className="bg-green-500/20 px-1 py-0.5 rounded">/{commandName}</code> to trigger this workflow.
          </div>
        </div>
      )}
    </Card>
  );
}
