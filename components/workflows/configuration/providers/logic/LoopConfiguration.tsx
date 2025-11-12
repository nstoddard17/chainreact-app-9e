"use client"

import React, { useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Repeat, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfigurationContainer } from '../../components/ConfigurationContainer';
import { GenericSelectField } from '../../fields/shared/GenericSelectField';

interface LoopConfigurationProps {
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

const LOOP_MODES = [
  { value: 'items', label: 'Loop Over Items' },
  { value: 'count', label: 'Loop N Times' },
];

export function LoopConfiguration({
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
}: LoopConfigurationProps) {
  // Set default values
  useEffect(() => {
    if (!values.loopMode) {
      setValue('loopMode', 'items');
    }
    if (!values.batchSize) {
      setValue('batchSize', '1');
    }
  }, []);

  const loopMode = values.loopMode || 'items';
  const isItemsMode = loopMode === 'items';

  // Memoize variable options to prevent infinite re-renders
  const variableOptions = useMemo(() => {
    if (!availableVariables || availableVariables.length === 0) {
      return [];
    }

    return availableVariables.flatMap(varGroup =>
      varGroup.fields?.map((field: any) => ({
        value: `{{${varGroup.nodeId}.${field.name}}}`,
        label: `${varGroup.label || varGroup.nodeId} - ${field.label || field.name}`
      })) || []
    );
  }, [availableVariables]);

  // Compute form validity
  const isFormValid = useMemo(() => {
    if (isItemsMode) {
      return !!values.items;
    } else {
      // Count mode
      return !!values.count && parseInt(values.count) > 0;
    }
  }, [values.items, values.count, values.loopMode, isItemsMode]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isItemsMode) {
      if (!values.items) {
        alert('Please select or enter an array to loop over');
        return;
      }
    } else {
      if (!values.count) {
        alert('Please enter the number of times to loop');
        return;
      }
      const countNum = parseInt(values.count);
      if (isNaN(countNum) || countNum <= 0) {
        alert('Loop count must be a positive number');
        return;
      }
      if (countNum > 500) {
        alert('Loop count cannot exceed 500 iterations');
        return;
      }
    }

    // Validate batch size if provided
    if (values.batchSize) {
      const batchNum = parseInt(values.batchSize);
      if (isNaN(batchNum) || batchNum <= 0) {
        alert('Batch size must be a positive number');
        return;
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
      submitLabel={`${isEditMode ? 'Update' : 'Save'} Loop`}
    >
      <div className="space-y-6">
        {/* Loop Mode */}
        <div>
          <Label>Loop Mode</Label>
          <div className="mt-2">
            <GenericSelectField
              field={{
                name: 'loopMode',
                label: 'Loop Mode',
                type: 'select',
                required: true,
                options: LOOP_MODES
              }}
              value={loopMode}
              onChange={(value) => setValue('loopMode', value)}
              options={LOOP_MODES}
              nodeInfo={nodeInfo}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isItemsMode
              ? 'Iterate through each item in an array from previous steps'
              : 'Repeat an action a specific number of times'}
          </p>
        </div>

        {/* Items Mode */}
        {isItemsMode && (
          <>
            {/* Items Array */}
            <div>
              <Label htmlFor="items">Items to Loop Over</Label>
              <div className="mt-2">
                {variableOptions.length > 0 ? (
                  <GenericSelectField
                    field={{
                      name: 'items',
                      label: 'Items to Loop Over',
                      type: 'select',
                      required: true,
                    }}
                    value={values.items || ''}
                    onChange={(value) => setValue('items', value)}
                    options={variableOptions}
                    nodeInfo={nodeInfo}
                    error={errors.items}
                  />
                ) : (
                  <div className="flex h-10 w-full min-w-0 items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
                    <span>No upstream nodes found. Connect nodes to this one to see available data.</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {variableOptions.length > 0
                  ? 'Select an array output from a previous node (e.g., list of contacts, emails, records)'
                  : 'Add nodes before this loop to select data from'}
              </p>
            </div>

            {/* Batch Size */}
            <div>
              <Label htmlFor="batchSize">Batch Size</Label>
              <Input
                id="batchSize"
                type="number"
                min="1"
                value={values.batchSize || '1'}
                onChange={(e) => setValue('batchSize', e.target.value)}
                placeholder="1"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Number of items to process per iteration (default: 1)
              </p>
            </div>

            {/* Info Alert for Items Mode */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium text-sm mb-1">How Loop Over Items Works</p>
                <ul className="text-xs space-y-1">
                  <li>• Processes items <strong>sequentially</strong> (one at a time, in order)</li>
                  <li>• Each iteration waits for the previous to complete</li>
                  <li>• Access current item: <code className="bg-muted px-1 py-0.5 rounded">{`{{Loop.currentItem}}`}</code></li>
                  <li>• Access index: <code className="bg-muted px-1 py-0.5 rounded">{`{{Loop.index}}`}</code></li>
                  <li>• Access iteration number: <code className="bg-muted px-1 py-0.5 rounded">{`{{Loop.iteration}}`}</code></li>
                  <li>• Total items: <code className="bg-muted px-1 py-0.5 rounded">{`{{Loop.totalItems}}`}</code></li>
                  <li>• Batch size &gt; 1 processes multiple items per iteration</li>
                  <li>• Useful for API rate limiting and data processing</li>
                </ul>
              </AlertDescription>
            </Alert>
          </>
        )}

        {/* Count Mode */}
        {!isItemsMode && (
          <>
            {/* Loop Count */}
            <div>
              <Label htmlFor="count">Number of Repetitions</Label>
              <Input
                id="count"
                type="number"
                min="1"
                max="500"
                value={values.count || ''}
                onChange={(e) => setValue('count', e.target.value)}
                placeholder="e.g., 10"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                How many times to repeat the loop (max: 500)
              </p>
            </div>

            {/* Initial Value */}
            <div>
              <Label htmlFor="initialValue">Initial Value (Optional)</Label>
              <Input
                id="initialValue"
                type="number"
                value={values.initialValue || '1'}
                onChange={(e) => setValue('initialValue', e.target.value)}
                placeholder="1"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Starting number for the counter (default: 1)
              </p>
            </div>

            {/* Step Increment */}
            <div>
              <Label htmlFor="stepIncrement">Step Increment (Optional)</Label>
              <Input
                id="stepIncrement"
                type="number"
                value={values.stepIncrement || '1'}
                onChange={(e) => setValue('stepIncrement', e.target.value)}
                placeholder="1"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                How much to increase the counter each iteration (default: 1)
              </p>
            </div>

            {/* Info Alert for Count Mode */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium text-sm mb-1">How Loop N Times Works</p>
                <ul className="text-xs space-y-1">
                  <li>• Repeats an action a specific number of times</li>
                  <li>• Access counter: <code className="bg-muted px-1 py-0.5 rounded">{`{{Loop.counter}}`}</code></li>
                  <li>• Access iteration: <code className="bg-muted px-1 py-0.5 rounded">{`{{Loop.iteration}}`}</code></li>
                  <li>• Example: Initial value 1, step 2, count 5 → produces 1, 3, 5, 7, 9</li>
                  <li>• Useful for repeating API calls, delays, or batch operations</li>
                  <li>• Maximum 500 iterations to prevent infinite loops</li>
                </ul>
              </AlertDescription>
            </Alert>
          </>
        )}

        {/* General Loop Info */}
        <Alert>
          <Repeat className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium text-sm mb-1">Loop Execution</p>
            <ul className="text-xs space-y-1">
              <li>• All loops execute <strong>sequentially</strong> (not in parallel)</li>
              <li>• Actions inside the loop run completely before moving to next iteration</li>
              <li>• Loop progress is tracked in real-time on the execution page</li>
              <li>• If any iteration fails, the loop stops and reports the error</li>
              <li>• Use batch size to process multiple items per iteration for efficiency</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    </ConfigurationContainer>
  );
}
