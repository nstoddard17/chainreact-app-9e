"use client"

import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Palette, Type, Hash, Calendar, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormattingRule {
  id: string;
  type: 'cell' | 'conditional';
  columns?: string[];
  conditions?: any[];
  formatting: {
    // Text formatting
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    fontSize?: number;
    fontFamily?: string;
    
    // Colors
    textColor?: string;
    backgroundColor?: string;
    
    // Alignment
    horizontalAlignment?: 'LEFT' | 'CENTER' | 'RIGHT';
    verticalAlignment?: 'TOP' | 'MIDDLE' | 'BOTTOM';
    
    // Number formatting
    numberFormat?: {
      type: 'NUMBER' | 'PERCENT' | 'CURRENCY' | 'DATE' | 'TIME' | 'DATE_TIME' | 'SCIENTIFIC';
      pattern?: string;
    };
    
    // Borders
    borders?: {
      top?: { style: string; color: string; width: number };
      bottom?: { style: string; color: string; width: number };
      left?: { style: string; color: string; width: number };
      right?: { style: string; color: string; width: number };
    };
  };
}

interface GoogleSheetsFormattingProps {
  field: any;
  value: FormattingRule[];
  onChange: (value: FormattingRule[]) => void;
  error?: string;
}

const FONT_FAMILIES = [
  'Arial',
  'Calibri',
  'Cambria',
  'Comic Sans MS',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Impact',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana'
];

const BORDER_STYLES = [
  { value: 'SOLID', label: 'Solid' },
  { value: 'DOTTED', label: 'Dotted' },
  { value: 'DASHED', label: 'Dashed' },
  { value: 'DOUBLE', label: 'Double' },
  { value: 'SOLID_MEDIUM', label: 'Medium' },
  { value: 'SOLID_THICK', label: 'Thick' }
];

const NUMBER_FORMATS = [
  { value: 'NUMBER', label: 'Number', pattern: '#,##0.00' },
  { value: 'PERCENT', label: 'Percentage', pattern: '0.00%' },
  { value: 'CURRENCY', label: 'Currency', pattern: '"$"#,##0.00' },
  { value: 'DATE', label: 'Date', pattern: 'mm/dd/yyyy' },
  { value: 'TIME', label: 'Time', pattern: 'h:mm:ss AM/PM' },
  { value: 'DATE_TIME', label: 'Date Time', pattern: 'mm/dd/yyyy h:mm:ss AM/PM' },
  { value: 'SCIENTIFIC', label: 'Scientific', pattern: '0.00E+00' }
];

const PRESET_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'
];

export function GoogleSheetsFormatting({
  field,
  value = [],
  onChange,
  error
}: GoogleSheetsFormattingProps) {
  const [activeRule, setActiveRule] = useState<FormattingRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createNewRule = (type: 'cell' | 'conditional') => {
    const newRule: FormattingRule = {
      id: Date.now().toString(),
      type,
      columns: [],
      conditions: [],
      formatting: {
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        fontSize: 10,
        fontFamily: 'Arial',
        textColor: '#000000',
        backgroundColor: '#ffffff',
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    };
    setActiveRule(newRule);
    setIsCreating(true);
  };

  const saveRule = () => {
    if (activeRule) {
      const existingIndex = value.findIndex(rule => rule.id === activeRule.id);
      if (existingIndex >= 0) {
        const updatedRules = [...value];
        updatedRules[existingIndex] = activeRule;
        onChange(updatedRules);
      } else {
        onChange([...value, activeRule]);
      }
      setActiveRule(null);
      setIsCreating(false);
    }
  };

  const cancelEdit = () => {
    setActiveRule(null);
    setIsCreating(false);
  };

  const deleteRule = (ruleId: string) => {
    onChange(value.filter(rule => rule.id !== ruleId));
  };

  const editRule = (rule: FormattingRule) => {
    setActiveRule({ ...rule });
    setIsCreating(false);
  };

  const updateActiveRule = (updates: Partial<FormattingRule>) => {
    if (activeRule) {
      setActiveRule({ ...activeRule, ...updates });
    }
  };

  const updateFormatting = (formattingUpdates: Partial<FormattingRule['formatting']>) => {
    if (activeRule) {
      setActiveRule({
        ...activeRule,
        formatting: { ...activeRule.formatting, ...formattingUpdates }
      });
    }
  };

  return (
    <div className="space-y-4">
      {field.label && (
        <label className="text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      {field.description && (
        <p className="text-sm text-gray-600">{field.description}</p>
      )}

      {/* Existing Rules */}
      {value.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Formatting Rules ({value.length})
          </h4>
          
          {value.map((rule) => (
            <Card key={rule.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={rule.type === 'conditional' ? 'default' : 'secondary'}>
                    {rule.type === 'conditional' ? 'Conditional' : 'Cell'}
                  </Badge>
                  <div className="text-sm">
                    {rule.type === 'conditional' ? (
                      <span>Apply when conditions are met</span>
                    ) : (
                      <span>Apply to columns: {rule.columns?.join(', ') || 'None'}</span>
                    )}
                  </div>
                  
                  {/* Preview of formatting */}
                  <div className="flex items-center gap-1 ml-4">
                    {rule.formatting.bold && <Badge variant="outline" className="text-xs">Bold</Badge>}
                    {rule.formatting.italic && <Badge variant="outline" className="text-xs">Italic</Badge>}
                    {rule.formatting.textColor && rule.formatting.textColor !== '#000000' && (
                      <div 
                        className="w-4 h-4 rounded border border-gray-300" 
                        style={{ backgroundColor: rule.formatting.textColor }}
                        title="Text Color"
                      />
                    )}
                    {rule.formatting.backgroundColor && rule.formatting.backgroundColor !== '#ffffff' && (
                      <div 
                        className="w-4 h-4 rounded border border-gray-300" 
                        style={{ backgroundColor: rule.formatting.backgroundColor }}
                        title="Background Color"
                      />
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => editRule(rule)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteRule(rule.id)} className="text-red-600 hover:text-red-700">
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add New Rule Buttons */}
      {!activeRule && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => createNewRule('cell')} className="flex items-center gap-2">
            <Type className="h-4 w-4" />
            Add Cell Formatting
          </Button>
          <Button variant="outline" onClick={() => createNewRule('conditional')} className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            Add Conditional Formatting
          </Button>
        </div>
      )}

      {/* Rule Editor */}
      {activeRule && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {isCreating ? 'Create' : 'Edit'} {activeRule.type === 'conditional' ? 'Conditional' : 'Cell'} Formatting Rule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Rule Configuration */}
            <div className="space-y-4">
              {activeRule.type === 'cell' && (
                <div>
                  <Label>Apply to Columns</Label>
                  <Input
                    placeholder="e.g., A, B, C or A:C"
                    value={activeRule.columns?.join(', ') || ''}
                    onChange={(e) => updateActiveRule({ 
                      columns: e.target.value.split(',').map(col => col.trim()).filter(Boolean)
                    })}
                  />
                </div>
              )}
              
              {activeRule.type === 'conditional' && (
                <div>
                  <Label>Conditions</Label>
                  <p className="text-sm text-gray-600">
                    This rule will apply when the specified conditions are met. 
                    Configure conditions in the main form.
                  </p>
                </div>
              )}
            </div>

            {/* Formatting Options */}
            <Tabs defaultValue="text" className="w-full">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="text">Text</TabsTrigger>
                <TabsTrigger value="colors">Colors</TabsTrigger>
                <TabsTrigger value="alignment">Alignment</TabsTrigger>
                <TabsTrigger value="numbers">Numbers</TabsTrigger>
              </TabsList>
              
              <TabsContent value="text" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Font Family</Label>
                    <Select 
                      value={activeRule.formatting.fontFamily} 
                      onValueChange={(value) => updateFormatting({ fontFamily: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_FAMILIES.map(font => (
                          <SelectItem key={font} value={font}>{font}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Font Size</Label>
                    <Input
                      type="number"
                      min="6"
                      max="400"
                      value={activeRule.formatting.fontSize}
                      onChange={(e) => updateFormatting({ fontSize: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="bold"
                      checked={activeRule.formatting.bold}
                      onCheckedChange={(checked) => updateFormatting({ bold: checked as boolean })}
                    />
                    <Label htmlFor="bold" className="font-bold">Bold</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="italic"
                      checked={activeRule.formatting.italic}
                      onCheckedChange={(checked) => updateFormatting({ italic: checked as boolean })}
                    />
                    <Label htmlFor="italic" className="italic">Italic</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="underline"
                      checked={activeRule.formatting.underline}
                      onCheckedChange={(checked) => updateFormatting({ underline: checked as boolean })}
                    />
                    <Label htmlFor="underline" className="underline">Underline</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="strikethrough"
                      checked={activeRule.formatting.strikethrough}
                      onCheckedChange={(checked) => updateFormatting({ strikethrough: checked as boolean })}
                    />
                    <Label htmlFor="strikethrough" className="line-through">Strikethrough</Label>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="colors" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Text Color</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="color"
                        value={activeRule.formatting.textColor}
                        onChange={(e) => updateFormatting({ textColor: e.target.value })}
                        className="w-12 h-8"
                      />
                      <Input
                        type="text"
                        value={activeRule.formatting.textColor}
                        onChange={(e) => updateFormatting({ textColor: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {PRESET_COLORS.map(color => (
                        <button
                          key={color}
                          className="w-6 h-6 rounded border border-gray-300 cursor-pointer hover:scale-110"
                          style={{ backgroundColor: color }}
                          onClick={() => updateFormatting({ textColor: color })}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <Label>Background Color</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="color"
                        value={activeRule.formatting.backgroundColor}
                        onChange={(e) => updateFormatting({ backgroundColor: e.target.value })}
                        className="w-12 h-8"
                      />
                      <Input
                        type="text"
                        value={activeRule.formatting.backgroundColor}
                        onChange={(e) => updateFormatting({ backgroundColor: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {PRESET_COLORS.map(color => (
                        <button
                          key={color}
                          className="w-6 h-6 rounded border border-gray-300 cursor-pointer hover:scale-110"
                          style={{ backgroundColor: color }}
                          onClick={() => updateFormatting({ backgroundColor: color })}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="alignment" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Horizontal Alignment</Label>
                    <div className="flex gap-1 mt-1">
                      <Button
                        variant={activeRule.formatting.horizontalAlignment === 'LEFT' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateFormatting({ horizontalAlignment: 'LEFT' })}
                      >
                        <AlignLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={activeRule.formatting.horizontalAlignment === 'CENTER' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateFormatting({ horizontalAlignment: 'CENTER' })}
                      >
                        <AlignCenter className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={activeRule.formatting.horizontalAlignment === 'RIGHT' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateFormatting({ horizontalAlignment: 'RIGHT' })}
                      >
                        <AlignRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Vertical Alignment</Label>
                    <Select
                      value={activeRule.formatting.verticalAlignment}
                      onValueChange={(value) => updateFormatting({ verticalAlignment: value as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TOP">Top</SelectItem>
                        <SelectItem value="MIDDLE">Middle</SelectItem>
                        <SelectItem value="BOTTOM">Bottom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="numbers" className="space-y-4">
                <div>
                  <Label>Number Format</Label>
                  <Select
                    value={activeRule.formatting.numberFormat?.type}
                    onValueChange={(value) => {
                      const format = NUMBER_FORMATS.find(f => f.value === value);
                      updateFormatting({ 
                        numberFormat: { 
                          type: value as any, 
                          pattern: format?.pattern || '' 
                        }
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select number format" />
                    </SelectTrigger>
                    <SelectContent>
                      {NUMBER_FORMATS.map(format => (
                        <SelectItem key={format.value} value={format.value}>
                          {format.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {activeRule.formatting.numberFormat && (
                  <div>
                    <Label>Custom Pattern</Label>
                    <Input
                      value={activeRule.formatting.numberFormat.pattern}
                      onChange={(e) => updateFormatting({
                        numberFormat: {
                          ...activeRule.formatting.numberFormat!,
                          pattern: e.target.value
                        }
                      })}
                      placeholder="e.g., #,##0.00"
                    />
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button onClick={saveRule}>
                {isCreating ? 'Create Rule' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}