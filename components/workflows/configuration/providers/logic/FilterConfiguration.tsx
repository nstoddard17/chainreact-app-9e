"use client"

import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Filter, ChevronLeft } from 'lucide-react';
import { CriteriaBuilder, ConditionalPath } from '../../fields/CriteriaBuilder';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FilterConfigurationProps {
  values: Record<string, any>;
  errors: Record<string, string>;
  setValue: (name: string, value: any) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onCancel: () => void;
  nodeInfo: any;
  isEditMode?: boolean;
  availableVariables?: any[];
}

export function FilterConfiguration({
  values,
  errors,
  setValue,
  handleSubmit,
  isLoading,
  onCancel,
  nodeInfo,
  isEditMode = false,
  availableVariables = []
}: FilterConfigurationProps) {

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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate conditions exist
    if (!values.conditions || values.conditions.length === 0) {
      alert('Please configure at least one filter condition');
      return;
    }

    // Get the first (and only) path since Filter only has one set of conditions
    const filterPath = values.conditions[0];
    if (!filterPath || !filterPath.conditions || filterPath.conditions.length === 0) {
      alert('Please add at least one condition to your filter');
      return;
    }

    // Check each condition has required fields
    for (const condition of filterPath.conditions) {
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

    handleSubmit(e);
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      <div className="flex-1 px-8 py-5 overflow-y-auto overflow-x-hidden">
          <div className="mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filter
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Stop the workflow if conditions are not met
            </p>
          </div>

          <div className="space-y-4">
            {/* Stop Message */}
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

            {/* Filter Conditions */}
            <div>
              <Label className="text-base font-medium mb-3 block">
                Filter Conditions
              </Label>
              <CriteriaBuilder
                value={values.conditions || []}
                onChange={(paths: ConditionalPath[]) => setValue('conditions', paths)}
                previousNodeOutputs={previousNodeOutputs}
                allowMultiplePaths={false}
                showPathNames={false}
              />
            </div>

            {/* Explanation */}
            <Alert>
              <Filter className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-1">How Filters Work:</p>
                <ul className="text-sm space-y-1">
                  <li>• If ALL conditions are met (or ANY with OR logic), workflow continues</li>
                  <li>• If conditions are NOT met, workflow stops immediately</li>
                  <li>• Useful for validating data before proceeding</li>
                  <li>• Stopped workflows show as "Stopped by Filter" in history</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        </div>

      <div className="border-t border-border px-8 py-4">
        <div className="flex justify-between items-center">
          <div>
            <Button type="button" variant="outline" onClick={onCancel}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
          <Button type="submit" disabled={isLoading}>
            {isEditMode ? 'Update' : 'Save'} Filter
          </Button>
        </div>
      </div>
    </form>
  );
}
