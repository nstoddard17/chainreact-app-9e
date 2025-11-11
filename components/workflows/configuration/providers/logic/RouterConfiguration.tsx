"use client"

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { GitFork, Filter } from 'lucide-react';
import { CriteriaBuilder, ConditionalPath } from '../../fields/CriteriaBuilder';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfigurationContainer } from '../../components/ConfigurationContainer';
import { GenericSelectField } from '../../fields/shared/GenericSelectField';

interface RouterConfigurationProps {
  values: Record<string, any>;
  errors: Record<string, string>;
  setValue: (name: string, value: any) => void;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  isLoading: boolean;
  onCancel: () => void;
  onBack?: () => void;
  nodeInfo: any;
  isEditMode?: boolean;
  availableVariables?: any[];
}

export function RouterConfiguration({
  values,
  errors,
  setValue,
  onSubmit,
  isLoading,
  onCancel,
  onBack,
  nodeInfo,
  isEditMode = false,
  availableVariables = []
}: RouterConfigurationProps) {

  const mode = values.mode || 'router';
  const isFilterMode = mode === 'filter';

  // Extract available field options from previous node outputs
  const previousNodeOutputs = React.useMemo(() => {
    const outputs: { name: string; label: string; type: string }[] = [];

    if (availableVariables && availableVariables.length > 0) {
      availableVariables.forEach(variable => {
        if (variable.nodeId && variable.fields) {
          variable.fields.forEach((field: any) => {
            outputs.push({
              name: `nodeOutputs.${variable.nodeId}.${field.name}`,
              label: `${variable.label || variable.nodeId} - ${field.label || field.name}`,
              type: field.type || 'string'
            });
          });
        }
      });
    }

    // Also add trigger data if available
    const triggerNode = availableVariables.find(v => v.isTrigger || v.nodeId === 'trigger');
    if (triggerNode && triggerNode.fields) {
      triggerNode.fields.forEach((field: any) => {
        outputs.push({
          name: `trigger.${field.name}`,
          label: `Trigger - ${field.label || field.name}`,
          type: field.type || 'string'
        });
      });
    }

    return outputs;
  }, [availableVariables]);

  // Compute form validity
  const isFormValid = React.useMemo(() => {
    if (!values.conditions || values.conditions.length === 0) {
      return false;
    }

    // Check all paths have valid conditions
    for (const path of values.conditions) {
      if (!path.conditions || path.conditions.length === 0) {
        return false;
      }

      for (const condition of path.conditions) {
        if (!condition.field || !condition.operator) {
          return false;
        }
        const operatorsWithoutValue = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];
        if (!operatorsWithoutValue.includes(condition.operator) && !condition.value) {
          return false;
        }
      }
    }

    return true;
  }, [values.conditions]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate conditions exist
    if (!values.conditions || values.conditions.length === 0) {
      alert('Please configure at least one condition');
      return;
    }

    // Validate all paths
    for (const path of values.conditions) {
      if (!path.conditions || path.conditions.length === 0) {
        alert('Please add at least one condition to each path');
        return;
      }

      // Check each condition has required fields
      for (const condition of path.conditions) {
        if (!condition.field) {
          alert('Please select a field for all conditions');
          return;
        }
        if (!condition.operator) {
          alert('Please select an operator for all conditions');
          return;
        }
        // Check if value is needed for this operator
        const operatorsWithoutValue = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];
        if (!operatorsWithoutValue.includes(condition.operator) && !condition.value) {
          alert('Please enter a value for all conditions');
          return;
        }
      }
    }

    await onSubmit(values);
  };

  const Icon = isFilterMode ? Filter : GitFork;

  return (
    <ConfigurationContainer
      onSubmit={handleSave}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
      submitLabel={`${isEditMode ? 'Update' : 'Save'} Router`}
    >
      <div className="mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Icon className="w-5 h-5" />
          Router
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {isFilterMode
            ? 'Stop the workflow if conditions are not met'
            : 'Route workflow to different paths based on conditions'
          }
        </p>
      </div>

      <div className="space-y-6">
        {/* Mode Selection */}
        <div>
          <Label htmlFor="mode">Router Mode</Label>
          <div className="mt-2">
            <GenericSelectField
              field={{
                name: 'mode',
                label: 'Router Mode',
                type: 'select',
                required: true,
                options: [
                  { value: 'filter', label: 'Filter - Continue or stop workflow' },
                  { value: 'router', label: 'Router - Multi-path routing' }
                ]
              }}
              value={mode}
              onChange={(value) => setValue('mode', value)}
              options={[
                { value: 'filter', label: 'Filter - Continue or stop workflow' },
                { value: 'router', label: 'Router - Multi-path routing' }
              ]}
              error={errors.mode}
              nodeInfo={nodeInfo}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isFilterMode
              ? 'Filter mode stops the workflow if conditions aren\'t met'
              : 'Router mode creates multiple output paths based on conditions'
            }
          </p>
        </div>

        {/* Stop Message (Filter mode only) */}
        {isFilterMode && (
          <div>
            <Label htmlFor="stopMessage">
              Stop Message <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="stopMessage"
              value={values.stopMessage || ''}
              onChange={(e) => setValue('stopMessage', e.target.value)}
              placeholder="Custom message when workflow is stopped"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This message will be shown in workflow history when the filter stops execution
            </p>
          </div>
        )}

        {/* Conditions */}
        <div>
          <Label className="text-base font-medium mb-3 block">
            {isFilterMode ? 'Filter Conditions' : 'Routing Conditions'}
          </Label>
          <CriteriaBuilder
            value={values.conditions || []}
            onChange={(paths: ConditionalPath[]) => setValue('conditions', paths)}
            previousNodeOutputs={previousNodeOutputs}
            allowMultiplePaths={!isFilterMode}
            showPathNames={!isFilterMode}
            maxPaths={isFilterMode ? 1 : 5}
          />
        </div>

        {/* Explanation */}
        <Alert>
          <Icon className="h-4 w-4" />
          <AlertDescription>
            {isFilterMode ? (
              <>
                <p className="font-medium mb-1">How Filter Mode Works:</p>
                <ul className="text-sm space-y-1">
                  <li>• If ALL conditions are met (or ANY with OR logic), workflow continues</li>
                  <li>• If conditions are NOT met, workflow stops immediately</li>
                  <li>• Useful for validating data before proceeding</li>
                  <li>• Stopped workflows show as "Stopped by Filter" in history</li>
                </ul>
              </>
            ) : (
              <>
                <p className="font-medium mb-1">How Router Mode Works:</p>
                <ul className="text-sm space-y-1">
                  <li>• Each path creates a separate output handle on the canvas</li>
                  <li>• The FIRST matching path is taken (evaluated top to bottom)</li>
                  <li>• If no paths match, the "Else" handle is used</li>
                  <li>• Connect different actions to each path for branching logic</li>
                </ul>
              </>
            )}
          </AlertDescription>
        </Alert>
      </div>
    </ConfigurationContainer>
  );
}
