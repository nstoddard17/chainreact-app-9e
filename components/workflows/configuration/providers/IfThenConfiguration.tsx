"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GitBranch, ChevronLeft, Wand2, Code, ChevronDown } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { VariablePicker } from '../../VariablePicker';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface IfThenConfigurationProps {
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

export function IfThenConfiguration({
  values,
  errors,
  setValue,
  handleSubmit,
  isLoading,
  onCancel,
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

  const [activeTab, setActiveTab] = useState("basic");
  const [fieldDropdownOpen, setFieldDropdownOpen] = useState(false);

  // Generate field options from available variables in the current workflow
  const fieldOptions = useMemo(() => {
    const options = [];

    // Add trigger data ONLY if there's a trigger in the current workflow
    const triggerNode = availableVariables.find(v => v.isTrigger || v.nodeId === 'trigger');

    if (triggerNode) {
      // Check what type of trigger it is
      const triggerType = triggerNode.type || triggerNode.nodeType;

      // Add trigger-specific fields based on the trigger type
      if (triggerType === 'manual') {
        // Manual trigger has minimal data
        options.push(
          { value: '{{trigger.timestamp}}', label: 'Trigger Timestamp', group: 'Trigger Data' },
          { value: '{{trigger.id}}', label: 'Trigger ID', group: 'Trigger Data' }
        );
      } else if (triggerType === 'schedule') {
        // Schedule trigger fields
        options.push(
          { value: '{{trigger.scheduledTime}}', label: 'Scheduled Time', group: 'Trigger Data' },
          { value: '{{trigger.timezone}}', label: 'Timezone', group: 'Trigger Data' },
          { value: '{{trigger.timestamp}}', label: 'Execution Time', group: 'Trigger Data' }
        );
      } else if (triggerType === 'webhook') {
        // Webhook trigger fields
        options.push(
          { value: '{{trigger.body}}', label: 'Request Body', group: 'Trigger Data' },
          { value: '{{trigger.headers}}', label: 'Request Headers', group: 'Trigger Data' },
          { value: '{{trigger.method}}', label: 'HTTP Method', group: 'Trigger Data' },
          { value: '{{trigger.query}}', label: 'Query Parameters', group: 'Trigger Data' }
        );
      } else if (triggerNode.fields && triggerNode.fields.length > 0) {
        // Use actual fields from the trigger node
        triggerNode.fields.forEach((field: any) => {
          options.push({
            value: `{{trigger.${field.name}}}`,
            label: field.label || field.name,
            group: 'Trigger Data'
          });
        });
      } else {
        // Generic trigger fields
        options.push(
          { value: '{{trigger.data}}', label: 'Trigger Data', group: 'Trigger Data' },
          { value: '{{trigger.id}}', label: 'Trigger ID', group: 'Trigger Data' }
        );
      }
    }

    // Add previous node outputs from actual nodes in the workflow
    if (availableVariables && availableVariables.length > 0) {
      availableVariables.forEach(variable => {
        // Skip trigger nodes (already handled above)
        if (variable.isTrigger || variable.nodeId === 'trigger') return;

        if (variable.nodeId && variable.fields) {
          variable.fields.forEach((field: any) => {
            options.push({
              value: `{{nodeOutputs.${variable.nodeId}.${field.name}}}`,
              label: field.label || field.name,
              group: variable.label || 'Previous Steps'
            });
          });
        }
      });
    }

    // If no fields available, don't add any generic placeholders
    // The user should add nodes first to get actual fields

    return options;
  }, [availableVariables]);

  // Group field options by category
  const groupedFieldOptions = useMemo(() => {
    const groups: Record<string, typeof fieldOptions> = {};
    fieldOptions.forEach(option => {
      if (!groups[option.group]) {
        groups[option.group] = [];
      }
      groups[option.group].push(option);
    });
    return groups;
  }, [fieldOptions]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate based on active tab
    if (activeTab === "basic") {
      if (!values.field) {
        alert('Please enter a field to check');
        return;
      }
      if (!values.operator) {
        alert('Please select an operator');
        return;
      }
      // Only require value for operators that need it
      const operatorsNeedingValue = ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than'];
      if (operatorsNeedingValue.includes(values.operator) && !values.value) {
        alert('Please enter a value to compare');
        return;
      }
    } else if (activeTab === "advanced" && values.conditionType === 'advanced') {
      if (!values.advancedExpression) {
        alert('Please enter a JavaScript expression');
        return;
      }
    }

    handleSubmit(e);
  };

  // Operators that don't need a value
  const operatorsWithoutValue = ['is_empty', 'is_not_empty'];
  const showValueField = !operatorsWithoutValue.includes(values.operator);

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      <div className="flex-1 px-8 py-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            If/Then Condition
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Control your workflow based on conditions
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="basic">
              <Wand2 className="w-4 h-4 mr-2" />
              Basic
            </TabsTrigger>
            <TabsTrigger value="advanced">
              <Code className="w-4 h-4 mr-2" />
              Advanced
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[calc(90vh-300px)] pr-4">
            <TabsContent value="basic" className="space-y-4 mt-0 pr-2">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="field" className="text-base font-medium">
                    If this value...
                  </Label>
                  <div className="mt-2 flex gap-2">
                    <div className="flex-1">
                      <Popover open={fieldDropdownOpen} onOpenChange={setFieldDropdownOpen}>
                        <PopoverTrigger asChild>
                          <div className="relative">
                            <Input
                              id="field"
                              value={values.field || ''}
                              onChange={(e) => setValue('field', e.target.value)}
                              placeholder="Select a field or type a value"
                              className="w-full pr-8"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
                              onClick={() => setFieldDropdownOpen(!fieldDropdownOpen)}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </PopoverTrigger>
                        <PopoverContent
                          className="p-0"
                          align="start"
                          sideOffset={4}
                          style={{
                            width: 'var(--radix-popover-trigger-width)',
                            maxWidth: 'var(--radix-popover-trigger-width)',
                            minWidth: 'var(--radix-popover-trigger-width)'
                          }}
                        >
                        <Command>
                          {fieldOptions.length > 0 && (
                            <CommandInput placeholder="Search fields..." />
                          )}
                          <CommandList className={fieldOptions.length === 0 ? "" : "max-h-[300px] overflow-y-auto"}>
                            <CommandEmpty>
                              {fieldOptions.length === 0
                                ? "No fields available yet. Add nodes to your workflow first or type a custom value."
                                : "No field found. Type a custom value."}
                            </CommandEmpty>
                            {Object.entries(groupedFieldOptions).map(([group, options]) => (
                              <CommandGroup key={group} heading={group}>
                                {options.map((option) => (
                                  <CommandItem
                                    key={option.value}
                                    onSelect={() => {
                                      setValue('field', option.value);
                                      setFieldDropdownOpen(false);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span>{option.label}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {option.value}
                                      </span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    {availableVariables.length > 0 && (
                      <VariablePicker
                        value={values.field || ''}
                        onChange={(value) => setValue('field', value)}
                        availableVariables={availableVariables}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select from common fields or type your own value/variable
                  </p>
                </div>

                <div>
                  <Label htmlFor="operator" className="text-base font-medium">
                    Is...
                  </Label>
                  <Select
                    value={values.operator || 'equals'}
                    onValueChange={(value) => setValue('operator', value)}
                  >
                    <SelectTrigger id="operator" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equal to</SelectItem>
                      <SelectItem value="not_equals">Not equal to</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="not_contains">Does not contain</SelectItem>
                      <SelectItem value="greater_than">Greater than</SelectItem>
                      <SelectItem value="less_than">Less than</SelectItem>
                      <SelectItem value="is_empty">Empty</SelectItem>
                      <SelectItem value="is_not_empty">Not empty</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {showValueField && (
                  <div>
                    <Label htmlFor="value" className="text-base font-medium">
                      This value...
                    </Label>
                    <div className="mt-2 flex gap-2">
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
                        className="flex-1"
                      />
                      {availableVariables.length > 0 && (
                        <VariablePicker
                          value={values.value || ''}
                          onChange={(value) => setValue('value', value)}
                          availableVariables={availableVariables}
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      The value to compare against
                    </p>
                  </div>
                )}

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="continueOnFalse" className="text-base font-medium">
                        Continue if false?
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        By default, workflow stops if condition is false
                      </p>
                    </div>
                    <Switch
                      id="continueOnFalse"
                      checked={values.continueOnFalse || false}
                      onCheckedChange={(checked) => setValue('continueOnFalse', checked)}
                    />
                  </div>
                </div>

                {/* Show a preview of the condition */}
                <Alert>
                  <GitBranch className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium mb-1">Condition Preview:</p>
                    <p className="text-sm font-mono">
                      IF {values.field || '[field]'} {' '}
                      {values.operator === 'equals' && 'equals'}
                      {values.operator === 'not_equals' && 'does not equal'}
                      {values.operator === 'contains' && 'contains'}
                      {values.operator === 'not_contains' && 'does not contain'}
                      {values.operator === 'greater_than' && 'is greater than'}
                      {values.operator === 'less_than' && 'is less than'}
                      {values.operator === 'is_empty' && 'is empty'}
                      {values.operator === 'is_not_empty' && 'is not empty'}
                      {showValueField && ` ${values.value || '[value]'}`}
                    </p>
                    <p className="text-sm mt-1">
                      THEN: {values.continueOnFalse ? 'Continue regardless' : 'Continue only if true'}
                    </p>
                  </AlertDescription>
                </Alert>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 mt-0 pr-2">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="conditionType">Condition Mode</Label>
                  <Select
                    value={values.conditionType || 'simple'}
                    onValueChange={(value) => setValue('conditionType', value)}
                  >
                    <SelectTrigger id="conditionType" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Simple Comparison</SelectItem>
                      <SelectItem value="multiple">Multiple Conditions</SelectItem>
                      <SelectItem value="advanced">JavaScript Expression</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {values.conditionType === 'simple' && 'Use the basic tab for simple comparisons'}
                    {values.conditionType === 'multiple' && 'Combine multiple conditions with AND/OR logic'}
                    {values.conditionType === 'advanced' && 'Write custom JavaScript for complex logic'}
                  </p>
                </div>

                {values.conditionType === 'advanced' && (
                  <div>
                    <Label htmlFor="advancedExpression">JavaScript Expression</Label>
                    <Textarea
                      id="advancedExpression"
                      value={values.advancedExpression || ''}
                      onChange={(e) => setValue('advancedExpression', e.target.value)}
                      placeholder={`// Example expressions:\ndata.score > 80 && data.status === 'active'\ntrigger.email.includes('@company.com')\nnodeOutputs.previousNode.success === true\n\n// Available variables:\n// data - workflow data\n// trigger - trigger data\n// previous - previous node output\n// nodeOutputs - all node outputs`}
                      className="mt-1 font-mono text-sm"
                      rows={10}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Must return true or false
                    </p>
                  </div>
                )}

                {values.conditionType === 'simple' && (
                  <div>
                    <Label htmlFor="advancedOperators">Additional Operators</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      More comparison options for advanced users
                    </p>
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setValue('operator', 'greater_equal')}
                        className="mr-2"
                      >
                        Greater or Equal (≥)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setValue('operator', 'less_equal')}
                        className="mr-2"
                      >
                        Less or Equal (≤)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setValue('operator', 'starts_with')}
                        className="mr-2"
                      >
                        Starts With
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setValue('operator', 'ends_with')}
                        className="mr-2"
                      >
                        Ends With
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setValue('operator', 'exists')}
                        className="mr-2"
                      >
                        Exists
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setValue('operator', 'not_exists')}
                      >
                        Does Not Exist
                      </Button>
                    </div>
                  </div>
                )}

                {values.conditionType === 'multiple' && (
                  <>
                    <div>
                      <Label htmlFor="logicOperator">Combine Conditions With</Label>
                      <Select
                        value={values.logicOperator || 'and'}
                        onValueChange={(value) => setValue('logicOperator', value)}
                      >
                        <SelectTrigger id="logicOperator" className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="and">AND (all must be true)</SelectItem>
                          <SelectItem value="or">OR (any can be true)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Alert>
                      <AlertDescription>
                        Multiple conditions feature is coming soon. Use JavaScript expression for complex logic.
                      </AlertDescription>
                    </Alert>
                  </>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
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
            {isEditMode ? 'Update' : 'Save'} Condition
          </Button>
        </div>
      </div>
    </form>
  );
}