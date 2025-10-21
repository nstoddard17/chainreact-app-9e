"use client"

import React from 'react';
import { Button } from '@/components/ui/button';
import { GitFork, ChevronLeft } from 'lucide-react';
import { CriteriaBuilder, ConditionalPath } from '../../fields/CriteriaBuilder';

interface PathConfigurationProps {
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

export function PathConfiguration({
  values,
  errors,
  setValue,
  handleSubmit,
  isLoading,
  onCancel,
  nodeInfo,
  isEditMode = false,
  availableVariables = []
}: PathConfigurationProps) {

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

    // Validate paths exist
    if (!values.paths || values.paths.length === 0) {
      alert('Please configure at least one path with conditions');
      return;
    }

    // Validate each path has at least one condition
    for (const path of values.paths) {
      if (!path.conditions || path.conditions.length === 0) {
        alert(`Path "${path.name}" needs at least one condition`);
        return;
      }

      // Check each condition has required fields
      for (const condition of path.conditions) {
        if (!condition.field) {
          alert(`Please select a field in "${path.name}"`);
          return;
        }
        if (!condition.operator) {
          alert(`Please select an operator in "${path.name}"`);
          return;
        }
        // Check if value is needed for this operator
        const operatorsWithoutValue = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];
        if (!operatorsWithoutValue.includes(condition.operator) && !condition.value) {
          alert(`Please enter a value in "${path.name}"`);
          return;
        }
      }
    }

    handleSubmit(e);
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      <div className="flex-1 px-8 py-5 overflow-y-auto overflow-x-hidden">
          <div className="mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <GitFork className="w-5 h-5" />
              Path Router
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Route your workflow down different paths based on conditions
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <CriteriaBuilder
                value={values.paths || []}
                onChange={(paths: ConditionalPath[]) => setValue('paths', paths)}
                previousNodeOutputs={previousNodeOutputs}
                allowMultiplePaths={true}
                showPathNames={true}
              />
            </div>

            <div className="mt-4 p-3 bg-muted/30 rounded border text-sm">
              <p className="font-medium mb-1">How Path Routing Works:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Paths are evaluated in order from top to bottom</li>
                <li>The first path with matching conditions will be taken</li>
                <li>If no paths match, the workflow takes the "Else" path</li>
                <li>Multiple actions can be connected to each path</li>
              </ul>
            </div>
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
            {isEditMode ? 'Update' : 'Save'} Paths
          </Button>
        </div>
      </div>
    </form>
  );
}
