"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { GitBranch, Code, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { VariablePicker } from '../../VariablePicker';
import { ConfigurationContainer } from '../components/ConfigurationContainer';
import { GenericSelectField } from '../fields/shared/GenericSelectField';

interface IfThenConfigurationProps {
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

const BASIC_OPERATORS = [
  { value: 'equals', label: 'Equal to' },
  { value: 'not_equals', label: 'Not equal to' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'is_empty', label: 'Empty' },
  { value: 'is_not_empty', label: 'Not empty' },
];

const ADVANCED_OPERATORS = [
  { value: 'greater_equal', label: 'Greater than or equal (≥)' },
  { value: 'less_equal', label: 'Less than or equal (≤)' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'exists', label: 'Exists' },
  { value: 'not_exists', label: 'Does not exist' },
];

const ALL_OPERATORS = [...BASIC_OPERATORS, ...ADVANCED_OPERATORS];

export function IfThenConfiguration({
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
}: IfThenConfigurationProps) {
  // Set default values
  useEffect(() => {
    if (!values.operator) {
      setValue('operator', 'equals');
    }
    if (values.conditionType === undefined) {
      setValue('conditionType', 'simple');
    }
  }, []);

  const conditionType = values.conditionType || 'simple';
  const isAdvancedMode = conditionType === 'advanced';

  // Compute form validity
  const isFormValid = useMemo(() => {
    if (isAdvancedMode) {
      return !!values.advancedExpression;
    }

    if (!values.field || !values.operator) return false;
    const operatorsNeedingValue = ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'greater_equal', 'less_equal', 'starts_with', 'ends_with'];
    if (operatorsNeedingValue.includes(values.operator) && !values.value) return false;
    return true;
  }, [values.field, values.operator, values.value, values.advancedExpression, isAdvancedMode]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isAdvancedMode) {
      if (!values.advancedExpression) {
        alert('Please enter a JavaScript expression');
        return;
      }
    } else {
      if (!values.field) {
        alert('Please enter a field to check');
        return;
      }
      if (!values.operator) {
        alert('Please select an operator');
        return;
      }
      const operatorsNeedingValue = ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'greater_equal', 'less_equal', 'starts_with', 'ends_with'];
      if (operatorsNeedingValue.includes(values.operator) && !values.value) {
        alert('Please enter a value to compare');
        return;
      }
    }

    await onSubmit(values);
  };

  const operatorsWithoutValue = ['is_empty', 'is_not_empty', 'exists', 'not_exists'];
  const showValueField = !operatorsWithoutValue.includes(values.operator);

  return (
    <ConfigurationContainer
      onSubmit={handleSave}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
      submitLabel={`${isEditMode ? 'Update' : 'Save'} Condition`}
    >
      <div className="space-y-6">
        {/* Condition Mode */}
        <div>
          <Label>Condition Mode</Label>
          <div className="mt-2">
            <GenericSelectField
              field={{
                name: 'conditionType',
                label: 'Condition Mode',
                type: 'select',
                required: true,
                options: [
                  { value: 'simple', label: 'Simple Comparison' },
                  { value: 'advanced', label: 'JavaScript Expression' },
                ]
              }}
              value={conditionType}
              onChange={(value) => setValue('conditionType', value)}
              options={[
                { value: 'simple', label: 'Simple Comparison' },
                { value: 'advanced', label: 'JavaScript Expression' },
              ]}
              nodeInfo={nodeInfo}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {conditionType === 'simple' && 'Compare a field to a value using standard operators'}
            {conditionType === 'advanced' && 'Write custom JavaScript for complex logic'}
          </p>
        </div>

        {/* Simple Mode */}
        {!isAdvancedMode && (
          <>
            {/* Field */}
            <div>
              <Label htmlFor="field">If this value</Label>
              <div className="mt-2">
                {availableVariables.length > 0 ? (
                  <VariablePicker
                    value={values.field || ''}
                    onChange={(value) => setValue('field', value)}
                    availableVariables={availableVariables}
                  />
                ) : (
                  <Input
                    id="field"
                    value={values.field || ''}
                    onChange={(e) => setValue('field', e.target.value)}
                    placeholder="Enter field or {{variable}}"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Select a value from previous steps
              </p>
            </div>

            {/* Operator */}
            <div>
              <Label htmlFor="operator">Is</Label>
              <div className="mt-2">
                <GenericSelectField
                  field={{
                    name: 'operator',
                    label: 'Operator',
                    type: 'select',
                    required: true,
                  }}
                  value={values.operator || 'equals'}
                  onChange={(value) => setValue('operator', value)}
                  options={ALL_OPERATORS}
                  nodeInfo={nodeInfo}
                />
              </div>
            </div>

            {/* Value */}
            {showValueField && (
              <div>
                <Label htmlFor="value">This value</Label>
                <div className="mt-2">
                  {availableVariables.length > 0 ? (
                    <VariablePicker
                      value={values.value || ''}
                      onChange={(value) => setValue('value', value)}
                      availableVariables={availableVariables}
                    />
                  ) : (
                    <Input
                      id="value"
                      value={values.value || ''}
                      onChange={(e) => setValue('value', e.target.value)}
                      placeholder={
                        values.operator === 'contains' ? "e.g., @gmail.com" :
                        values.operator === 'greater_than' ? "e.g., 100" :
                        values.operator === 'less_than' ? "e.g., 50" :
                        "e.g., approved"
                      }
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {availableVariables.length > 0
                    ? 'Select a value from previous steps or enter a static value'
                    : 'The value to compare against'}
                </p>
              </div>
            )}

            {/* Continue on False */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="continueOnFalse" className="text-sm font-medium">
                    Continue if condition fails?
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    By default, workflow stops when condition is false
                  </p>
                </div>
                <Switch
                  id="continueOnFalse"
                  checked={values.continueOnFalse || false}
                  onCheckedChange={(checked) => setValue('continueOnFalse', checked)}
                />
              </div>
            </div>

            {/* Condition Preview */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium text-sm mb-1">Condition Preview</p>
                <div className="space-y-1 text-xs font-mono bg-muted/50 rounded p-2">
                  <p>
                    IF {values.field || '[field]'}{' '}
                    {ALL_OPERATORS.find(op => op.value === values.operator)?.label.toLowerCase() || values.operator}
                    {showValueField && ` ${values.value || '[value]'}`}
                  </p>
                  <p className="text-muted-foreground">
                    THEN: {values.continueOnFalse ? 'Continue regardless' : 'Continue only if true'}
                  </p>
                  <p className="text-muted-foreground">
                    OUTPUT: {'{{'} conditionMet: true|false {'}}'}
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          </>
        )}

        {/* Advanced Mode */}
        {isAdvancedMode && (
          <>
            <div>
              <Label htmlFor="advancedExpression">JavaScript Expression</Label>
              <Textarea
                id="advancedExpression"
                value={values.advancedExpression || ''}
                onChange={(e) => setValue('advancedExpression', e.target.value)}
                placeholder={`// Example expressions:\ndata.score > 80 && data.status === 'active'\ntrigger.email.includes('@company.com')\nnodeOutputs.previousNode.success === true\n\n// Available variables:\n// data - workflow data\n// trigger - trigger data\n// previous - previous node output\n// nodeOutputs - all node outputs`}
                className="mt-2 font-mono text-sm"
                rows={12}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Expression must return true or false
              </p>
            </div>

            <Alert>
              <Code className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium text-sm mb-1">How JavaScript Mode Works</p>
                <ul className="text-xs space-y-1">
                  <li>• Write any JavaScript expression that returns boolean</li>
                  <li>• Access trigger data, previous outputs, and workflow data</li>
                  <li>• Workflow always continues - use output in later nodes</li>
                  <li>• Result available as: {'{{'} conditionMet {'}}'}</li>
                </ul>
              </AlertDescription>
            </Alert>
          </>
        )}

        {/* Info Alert */}
        <Alert>
          <GitBranch className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium text-sm mb-1">How If/Then Works</p>
            <ul className="text-xs space-y-1">
              <li>• Always continues workflow (unlike Filter which stops)</li>
              <li>• Outputs <code className="bg-muted px-1 py-0.5 rounded">conditionMet: true/false</code> for later nodes to use</li>
              <li>• Use in subsequent actions: {'{{'} If/Then.conditionMet {'}}'}</li>
              <li>• Perfect for conditional branching without stopping workflow</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    </ConfigurationContainer>
  );
}
