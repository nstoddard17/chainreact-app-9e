"use client"

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { logger } from '@/lib/utils/logger';

interface LineItem {
  variant_id?: string;
  quantity?: number;
  product_id?: string; // Helper field for UI only
}

interface ShopifyLineItemsFieldProps {
  value: any;
  onChange: (value: any) => void;
  field: any;
  dynamicOptions: Record<string, any[]>;
  loadingFields?: Set<string>;
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean) => Promise<void>;
}

export function ShopifyLineItemsField({
  value,
  onChange,
  field,
  dynamicOptions,
  loadingFields = new Set(),
  loadOptions,
}: ShopifyLineItemsFieldProps) {
  // Parse value - should be an array of line item objects
  const lineItems: LineItem[] = Array.isArray(value) ? value : (value ? [value] : [{ quantity: 1 }]);

  const [openItems, setOpenItems] = useState<string[]>(['item-0']);
  const [pendingScrollIndex, setPendingScrollIndex] = useState<number | null>(null);
  const maxItems = field.metadata?.maxItems || 50;
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Products are stored under the field name, not the resource type
  // Products are automatically loaded by the parent component via dynamic: "shopify_products" and loadOnMount: true
  const products = dynamicOptions[field.name] || dynamicOptions['shopify_products'] || [];
  const isLoadingProducts = loadingFields.has(field.name) || loadingFields.has('shopify_products');

  const scrollItemIntoView = useCallback((itemIndex: number) => {
    const target = itemRefs.current[itemIndex];
    if (!target) return;

    const scrollParent = target.closest('[data-config-scroll-container="true"]') as HTMLElement | null;
    if (!scrollParent) return;

    const parentRect = scrollParent.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const relativeTop = targetRect.top - parentRect.top;
    const desiredScroll = scrollParent.scrollTop + relativeTop - 24;

    scrollParent.scrollTo({
      top: desiredScroll < 0 ? 0 : desiredScroll,
      behavior: 'smooth'
    });
  }, []);

  // Add a new line item
  const handleAddItem = useCallback(() => {
    if (lineItems.length >= maxItems) {
      return;
    }

    const newItem: LineItem = { quantity: 1 };
    const newItems = [...lineItems, newItem];
    onChange(newItems);

    const newIndex = newItems.length - 1;
    setOpenItems([`item-${newIndex}`]);
    setPendingScrollIndex(newIndex);
  }, [lineItems, maxItems, onChange]);

  // Remove a line item
  const handleRemoveItem = useCallback((index: number) => {
    const newItems = lineItems.filter((_: any, i: number) => i !== index);
    onChange(newItems.length > 0 ? newItems : [{ quantity: 1 }]);

    // Update open items after removal
    setOpenItems(prev => prev.filter(item => item !== `item-${index}`));
  }, [lineItems, onChange]);

  // Update a field in a specific line item
  const handleFieldChange = useCallback((itemIndex: number, fieldName: string, fieldValue: any) => {
    const newItems = [...lineItems];
    newItems[itemIndex] = {
      ...newItems[itemIndex],
      [fieldName]: fieldValue
    };

    // If product changed, clear variant
    // Variants are extracted from the product data, no API call needed
    if (fieldName === 'product_id' && fieldValue) {
      newItems[itemIndex].variant_id = undefined;
    }

    onChange(newItems);
  }, [lineItems, onChange]);

  // Get line item summary for the accordion trigger
  const getItemSummary = useCallback((item: LineItem, index: number) => {
    const parts: string[] = [];

    if (item.variant_id) {
      // Find the product first, then find the variant within it
      const product = products.find((p: any) => p.value === item.product_id);
      const variant = product?.variants?.find((v: any) => v.value === item.variant_id);
      if (variant) {
        parts.push(variant.label);
      } else {
        parts.push(`Variant ${item.variant_id}`);
      }
    } else if (item.product_id) {
      const product = products.find((p: any) => p.value === item.product_id);
      parts.push(product?.label || `Product ${item.product_id}`);
    }

    if (item.quantity) {
      parts.push(`Qty: ${item.quantity}`);
    }

    return parts.length > 0 ? parts.join(' • ') : 'Empty item';
  }, [products]);

  useEffect(() => {
    if (pendingScrollIndex === null) return;

    const raf = requestAnimationFrame(() => {
      scrollItemIntoView(pendingScrollIndex);
      setPendingScrollIndex(null);
    });

    return () => cancelAnimationFrame(raf);
  }, [pendingScrollIndex, scrollItemIntoView]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {field.label || 'Line Items'}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <span className="text-xs text-muted-foreground">
          {lineItems.length} / {maxItems} items
        </span>
      </div>

      {field.description && (
        <p className="text-sm text-muted-foreground">{field.description}</p>
      )}

      {/* Line Items Accordion */}
      <Accordion
        type="multiple"
        value={openItems}
        onValueChange={setOpenItems}
        className="w-full space-y-2"
      >
        {lineItems.map((item, index) => {
          const itemKey = `item-${index}`;

          // Get variants from the selected product (already loaded with products)
          const selectedProduct = products.find((p: any) => p.value === item.product_id);
          const variants = selectedProduct?.variants || [];
          const isLoadingVariants = false; // No longer loading separately

          return (
            <AccordionItem
              key={itemKey}
              value={itemKey}
              ref={(el) => { itemRefs.current[index] = el; }}
              className="border rounded-lg bg-card"
            >
              <div className="flex items-center px-4 py-3">
                <AccordionTrigger className="flex-1 hover:no-underline hover:bg-muted/50 py-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Item {index + 1}</span>
                    <span className="text-xs text-muted-foreground">
                      {getItemSummary(item, index)}
                    </span>
                  </div>
                </AccordionTrigger>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveItem(index);
                  }}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 ml-2"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <AccordionContent className="px-4 pb-4 pt-2">
                <div className="space-y-4">
                  {/* Product Selector */}
                  <div className="space-y-2">
                    <Label htmlFor={`product-${index}`} className="text-sm">
                      Product <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={item.product_id || ''}
                      onValueChange={(val) => handleFieldChange(index, 'product_id', val)}
                      disabled={isLoadingProducts}
                    >
                      <SelectTrigger id={`product-${index}`}>
                        <SelectValue placeholder={isLoadingProducts ? "Loading products..." : "Select a product"} />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product: any) => (
                          <SelectItem key={product.value} value={product.value}>
                            {product.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Variant Selector - only show if product is selected */}
                  {item.product_id && (
                    <div className="space-y-2">
                      <Label htmlFor={`variant-${index}`} className="text-sm">
                        Variant <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={item.variant_id || ''}
                        onValueChange={(val) => handleFieldChange(index, 'variant_id', val)}
                        disabled={isLoadingVariants}
                      >
                        <SelectTrigger id={`variant-${index}`}>
                          <SelectValue placeholder={isLoadingVariants ? "Loading variants..." : "Select a variant"} />
                        </SelectTrigger>
                        <SelectContent>
                          {variants.map((variant: any) => (
                            <SelectItem key={variant.value} value={variant.value}>
                              {variant.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Quantity Input */}
                  <div className="space-y-2">
                    <Label htmlFor={`quantity-${index}`} className="text-sm">
                      Quantity <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`quantity-${index}`}
                      type="number"
                      min="1"
                      value={item.quantity || 1}
                      onChange={(e) => handleFieldChange(index, 'quantity', parseInt(e.target.value, 10) || 1)}
                      placeholder="Enter quantity"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Add Item Button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddItem}
        disabled={lineItems.length >= maxItems}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Line Item
      </Button>
    </div>
  );
}
