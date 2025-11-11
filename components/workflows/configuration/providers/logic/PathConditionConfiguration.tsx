"use client"

import React, { useState, useMemo } from 'react';
import { GitBranch, Plus, TestTube2, Eye, EyeOff, Trash2, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ConfigurationContainer } from '../../components/ConfigurationContainer';
import { GroupedFieldSelector } from '../../fields/GroupedFieldSelector';
import { VariableAutocomplete } from '../../fields/VariableAutocomplete';
import { InlineValidation, ValidationError } from '../../fields/InlineValidation';
import { ConditionTester } from '../../fields/ConditionTester';
import { GenericSelectField } from '../../fields/shared/GenericSelectField';
import { cn } from '@/lib/utils';

interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string;
  isVariable?: boolean;
}

interface PathConditionConfigurationProps {
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

const TEXT_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

const NUMBER_OPERATORS = [
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '≠' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'greater_equal', label: '≥' },
  { value: 'less_equal', label: '≤' },
];

const BOOLEAN_OPERATORS = [
  { value: 'is_true', label: 'is true' },
  { value: 'is_false', label: 'is false' },
];

export function PathConditionConfiguration({
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
}: PathConditionConfigurationProps) {
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showTester, setShowTester] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  // Initialize conditions
  const conditions: Condition[] = useMemo(() => {
    if (Array.isArray(values.conditions)) {
      return values.conditions;
    }
    return [{
      id: crypto.randomUUID(),
      field: '',
      operator: 'equals',
      value: '',
    }];
  }, [values.conditions]);

  // Extract available field options
  const previousNodeOutputs = useMemo(() => {
    const outputs: { name: string; label: string; type: string; isTrigger?: boolean; nodeId?: string; nodeLabel?: string }[] = [];

    if (availableVariables && availableVariables.length > 0) {
      availableVariables.forEach(variable => {
        if (variable.nodeId && variable.fields) {
          variable.fields.forEach((field: any) => {
            outputs.push({
              name: `nodeOutputs.${variable.nodeId}.${field.name}`,
              label: field.label || field.name,
              type: field.type || 'string',
              nodeId: variable.nodeId,
              nodeLabel: variable.label || variable.nodeId
            });
          });
        }
      });
    }

    const triggerNode = availableVariables.find(v => v.isTrigger || v.nodeId === 'trigger');
    if (triggerNode && triggerNode.fields) {
      triggerNode.fields.forEach((field: any) => {
        outputs.push({
          name: `trigger.${field.name}`,
          label: field.label || field.name,
          type: field.type || 'string',
          isTrigger: true
        });
      });
    }

    return outputs;
  }, [availableVariables]);

  const getOperatorsForField = (fieldName: string) => {
    const field = previousNodeOutputs.find(f => f.name === fieldName);
    if (!field) return TEXT_OPERATORS;

    switch (field.type.toLowerCase()) {
      case 'number':
      case 'integer':
        return NUMBER_OPERATORS;
      case 'boolean':
        return BOOLEAN_OPERATORS;
      default:
        return TEXT_OPERATORS;
    }
  };

  const needsValue = (operator: string) => {
    return !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(operator);
  };

  const getExampleForType = (type: string): string => {
    switch (type.toLowerCase()) {
      case 'string':
      case 'text':
        return 'Example text';
      case 'number':
      case 'integer':
        return '42';
      case 'boolean':
        return 'true';
      case 'email':
        return 'user@example.com';
      case 'date':
      case 'datetime':
        return '2025-01-01';
      case 'url':
        return 'https://example.com';
      default:
        return 'value';
    }
  };

  const addCondition = () => {
    const newCondition: Condition = {
      id: crypto.randomUUID(),
      field: '',
      operator: 'equals',
      value: '',
    };
    setValue('conditions', [...conditions, newCondition]);
  };

  const removeCondition = (conditionId: string) => {
    setValue('conditions', conditions.filter(c => c.id !== conditionId));
  };

  const updateCondition = (conditionId: string, updates: Partial<Condition>) => {
    setValue('conditions', conditions.map(c =>
      c.id === conditionId ? { ...c, ...updates } : c
    ));
  };

  const isFormValid = useMemo(() => {
    if (!values.pathName || values.pathName.trim() === '') return false;
    if (!conditions || conditions.length === 0) return false;

    for (const condition of conditions) {
      if (!condition.field || !condition.operator) return false;
      if (needsValue(condition.operator) && !condition.value) return false;
    }

    return true;
  }, [values.pathName, conditions]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: ValidationError[] = [];

    if (!values.pathName || values.pathName.trim() === '') {
      errors.push({
        message: 'Please enter a path name',
        type: 'error'
      });
    }

    if (!conditions || conditions.length === 0) {
      errors.push({
        message: 'Please add at least one condition',
        type: 'error'
      });
    } else {
      conditions.forEach((condition, idx) => {
        if (!condition.field) {
          errors.push({
            message: `Condition ${idx + 1}: Please select a field`,
            type: 'error'
          });
        }
        if (!condition.operator) {
          errors.push({
            message: `Condition ${idx + 1}: Please select an operator`,
            type: 'error'
          });
        }
        if (needsValue(condition.operator) && !condition.value) {
          errors.push({
            message: `Condition ${idx + 1}: Please enter a value`,
            type: 'error'
          });
        }
      });
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    await onSubmit(values);
  };

  const completionPercentage = useMemo(() => {
    let total = 1;
    let complete = values.pathName && values.pathName.trim() !== '' ? 1 : 0;

    conditions.forEach(condition => {
      total += 3;
      if (condition.field) complete++;
      if (condition.operator) complete++;
      if (!needsValue(condition.operator) || condition.value) complete++;
    });

    return Math.round((complete / total) * 100);
  }, [values.pathName, conditions]);

  return (
    <ConfigurationContainer
      onSubmit={handleSave}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
      submitLabel={isEditMode ? 'Update Path' : 'Save Path'}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10">
              <GitBranch className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Path Conditions</h3>
              <p className="text-xs text-muted-foreground">Define when this path should execute</p>
            </div>
          </div>
          <Badge variant={completionPercentage === 100 ? "default" : "secondary"} className="text-xs">
            {completionPercentage}%
          </Badge>
        </div>

        {validationErrors.length > 0 && (
          <InlineValidation errors={validationErrors} />
        )}

        {/* Path Name */}
        <div className="space-y-2">
          <Label htmlFor="pathName">
            Path Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="pathName"
            value={values.pathName || ''}
            onChange={(e) => setValue('pathName', e.target.value)}
            placeholder="High Priority, VIP Customers, Urgent..."
          />
          <p className="text-xs text-muted-foreground">
            This name will identify the path on your workflow canvas
          </p>
        </div>

        <Separator />

        {/* Logic Operator */}
        <div className="space-y-2">
          <Label>Match Logic</Label>
          <GenericSelectField
            field={{
              name: 'logicOperator',
              label: 'Match Logic',
              type: 'select',
            }}
            value={values.logicOperator || 'and'}
            onChange={(value) => setValue('logicOperator', value)}
            options={[
              { value: 'and', label: 'AND - All conditions must match' },
              { value: 'or', label: 'OR - Any condition can match' },
            ]}
            nodeInfo={nodeInfo}
          />
          <p className="text-xs text-muted-foreground">
            Choose how multiple conditions should be evaluated
          </p>
        </div>

        <Separator />

        {/* Conditions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>
              Conditions <span className="text-destructive">*</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCondition}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add
            </Button>
          </div>

          {conditions.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Add at least one condition to define when this path should execute
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {conditions.map((condition, index) => (
                <div key={condition.id} className="relative">
                  {index > 0 && (
                    <div className="flex justify-center -mt-1.5 mb-1.5">
                      <Badge variant="secondary" className="text-xs px-2 py-0.5">
                        {values.logicOperator === 'or' ? 'OR' : 'AND'}
                      </Badge>
                    </div>
                  )}

                  <div className="p-3 border rounded-md bg-card space-y-3">
                    {/* Field */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Field</Label>
                      <GroupedFieldSelector
                        value={condition.field}
                        onChange={(value) => {
                          updateCondition(condition.id, { field: value });
                          const operators = getOperatorsForField(value);
                          if (!operators.find(op => op.value === condition.operator)) {
                            updateCondition(condition.id, { operator: operators[0].value });
                          }
                        }}
                        fields={previousNodeOutputs}
                        placeholder="Select field"
                        className="h-9"
                      />
                    </div>

                    {/* Operator */}
                    {condition.field && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Operator</Label>
                        <GenericSelectField
                          field={{
                            name: `operator_${condition.id}`,
                            label: 'Operator',
                            type: 'select',
                          }}
                          value={condition.operator}
                          onChange={(value) => updateCondition(condition.id, { operator: value })}
                          options={getOperatorsForField(condition.field)}
                          nodeInfo={nodeInfo}
                        />
                      </div>
                    )}

                    {/* Value */}
                    {condition.field && condition.operator && needsValue(condition.operator) && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Value</Label>
                        <VariableAutocomplete
                          value={condition.value}
                          onChange={(value) => updateCondition(condition.id, { value })}
                          variables={previousNodeOutputs.map(field => ({
                            name: field.name,
                            label: field.label,
                            type: field.type,
                            example: getExampleForType(field.type)
                          }))}
                          placeholder="Enter value..."
                          isVariable={condition.isVariable}
                          onToggleVariable={(isVar) => updateCondition(condition.id, { isVariable: isVar })}
                        />
                      </div>
                    )}

                    {conditions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCondition(condition.id)}
                        className="w-full text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview Toggle */}
        {conditions.length > 0 && conditions.some(c => c.field) && (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="w-full"
            >
              {showPreview ? <EyeOff className="w-4 h-4 mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}
              {showPreview ? 'Hide' : 'Show'} Preview
            </Button>

            {showPreview && (
              <div className="p-3 rounded-md bg-muted/50 border">
                <p className="text-xs font-medium mb-2">Path executes when:</p>
                <div className="space-y-1">
                  {conditions.filter(c => c.field).map((condition, index) => {
                    const field = previousNodeOutputs.find(f => f.name === condition.field);
                    const operator = getOperatorsForField(condition.field).find(op => op.value === condition.operator);

                    return (
                      <div key={condition.id} className="flex items-center gap-2 text-xs font-mono">
                        {index > 0 && (
                          <span className="text-muted-foreground font-bold">
                            {values.logicOperator === 'or' ? 'OR' : 'AND'}
                          </span>
                        )}
                        <span className="text-blue-600 dark:text-blue-400">{field?.label}</span>
                        <span className="text-purple-600 dark:text-purple-400">{operator?.label}</span>
                        {needsValue(condition.operator) && condition.value && (
                          <span className="text-green-600 dark:text-green-400">"{condition.value}"</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Test Button */}
        {conditions.length > 0 && conditions.some(c => c.field && c.operator) && (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTester(!showTester)}
              className="w-full"
            >
              <TestTube2 className="w-4 h-4 mr-1.5" />
              {showTester ? 'Hide' : 'Test'} Conditions
            </Button>

            {showTester && (
              <ConditionTester
                paths={[{
                  id: '1',
                  name: values.pathName || 'This Path',
                  conditions: conditions,
                  logicOperator: values.logicOperator || 'and'
                }]}
                onClose={() => setShowTester(false)}
              />
            )}
          </div>
        )}

        {/* Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            When the workflow reaches this path, it will check these conditions. If they match, execution continues down this branch.
          </AlertDescription>
        </Alert>
      </div>
    </ConfigurationContainer>
  );
}
