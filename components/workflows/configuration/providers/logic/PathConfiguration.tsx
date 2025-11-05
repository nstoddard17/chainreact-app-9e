"use client"

import React, { useEffect, useMemo } from 'react';
import { GitFork, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { CriteriaBuilder, ConditionalPath } from '../../fields/CriteriaBuilder';
import { ConfigurationContainer } from '../../components/ConfigurationContainer';

interface PathConfigurationProps {
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

export function PathConfiguration({
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
}: PathConfigurationProps) {

  const MAX_PATHS = 5
  const PATH_COLORS = [
    "#2563EB",
    "#EA580C",
    "#059669",
    "#9333EA",
    "#BE123C",
    "#14B8A6",
  ]

  useEffect(() => {
    if (Array.isArray(values.paths) && values.paths.length > 0) {
      const needsColor = values.paths.some((path: ConditionalPath) => !path?.color)
      if (needsColor) {
        const withColors = values.paths.map((path: ConditionalPath, index: number) => ({
          ...path,
          color: path?.color || PATH_COLORS[index % PATH_COLORS.length]
        }))
        setValue('paths', withColors)
      }
    }
  }, [values.paths, setValue])

  // Extract available field options from previous node outputs
  const previousNodeOutputs = useMemo(() => {
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

  const handlesPreview = useMemo(() => {
    const basePaths: Array<{ label: string; color: string }> = Array.isArray(values.paths)
      ? values.paths.map((path: ConditionalPath, index: number) => ({
          label: path.name || `Path ${String.fromCharCode(65 + index)}`,
          color: path.color || PATH_COLORS[index % PATH_COLORS.length]
        }))
      : []

    basePaths.push({
      label: 'Else (fallback)',
      color: '#64748B'
    })

    return basePaths
  }, [values.paths])

  const totalPaths = Array.isArray(values.paths) ? values.paths.length : 0

  // Compute form validity
  const isFormValid = useMemo(() => {
    if (!values.paths || values.paths.length === 0) {
      return false;
    }

    for (const path of values.paths) {
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
  }, [values.paths]);

  const handlePathsChange = (paths: ConditionalPath[]) => {
    setValue('paths', paths.slice(0, MAX_PATHS))
  }

  const handleSave = async (e: React.FormEvent) => {
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

    await onSubmit(values);
  };

  return (
    <ConfigurationContainer
      onSubmit={handleSave}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
      submitLabel={`${isEditMode ? 'Update' : 'Save'} Paths`}
    >
      <div className="mb-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <GitFork className="w-5 h-5 text-primary" />
              Intelligent Path Router
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Name each branch, define the conditions, and the workflow will fan out on the matching handle. A built-in Else handle catches anything that slips through.
            </p>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            {totalPaths} / {MAX_PATHS} paths configured
          </Badge>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm">
              <Share2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Canvas handles</p>
                <p className="text-muted-foreground">Each handle appears on the node with its label and color, ready for clean branching—exactly how teams expect in enterprise tools.</p>
              </div>
            </div>
          </div>

          <Separator className="my-3" />

          <div className="flex flex-wrap gap-2">
            {handlesPreview.map((handle) => {
              const isElse = handle.label === 'Else (fallback)'
              return (
                <Badge
                  key={handle.label}
                  variant="outline"
                  className={`gap-2 bg-background/70 text-foreground transition-all hover:bg-background ${
                    isElse ? 'border-dashed' : ''
                  }`}
                  style={{
                    borderColor: isElse ? undefined : `${handle.color}40`
                  }}
                >
                  {isElse ? (
                    <span className="text-[9px] opacity-60">↳</span>
                  ) : (
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-white/50 shadow-sm"
                      style={{ backgroundColor: handle.color }}
                    />
                  )}
                  <span className={isElse ? 'font-medium' : 'font-semibold'}>
                    {handle.label}
                  </span>
                </Badge>
              )
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <CriteriaBuilder
          value={values.paths || []}
          onChange={handlePathsChange}
          previousNodeOutputs={previousNodeOutputs}
          allowMultiplePaths={true}
          showPathNames={true}
          maxPaths={MAX_PATHS}
        />

        <Alert className="border-dashed border-border/70 bg-muted/40">
          <AlertTitle className="text-sm font-semibold">Router behaviour</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            Paths are evaluated from top to bottom. The first path whose conditions pass will run and downstream actions on its handle will execute. If nothing matches, the Else handle fires—wire it to a catch-all sequence or leave it unconnected to quietly stop unmatched runs.
          </AlertDescription>
        </Alert>
      </div>
    </ConfigurationContainer>
  );
}
