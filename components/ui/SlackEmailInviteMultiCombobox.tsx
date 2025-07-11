import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

interface SlackEmailInviteMultiComboboxProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
}

export function SlackEmailInviteMultiCombobox({
  value,
  onChange,
  options,
  placeholder = "Enter a name or email",
  disabled = false,
}: SlackEmailInviteMultiComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  // Create virtual options for selected emails that aren't in the original options
  const allOptions = React.useMemo(() => {
    const existingOptions = [...options];
    
    // Add virtual options for selected emails that aren't in the original options
    value.forEach(selectedValue => {
      if (!existingOptions.some(opt => opt.value === selectedValue)) {
        existingOptions.push({
          value: selectedValue,
          label: selectedValue,
          description: "Added email"
        });
      }
    });
    
    return existingOptions;
  }, [options, value]);

  const selectedOptions = allOptions.filter((option) => value.includes(option.value));

  const handleSelect = (currentValue: string) => {
    const newValue = value.includes(currentValue)
      ? value.filter((v) => v !== currentValue)
      : [...value, currentValue];
    onChange(newValue);
  };

  const handleRemove = (valueToRemove: string) => {
    onChange(value.filter((v) => v !== valueToRemove));
  };

  const handleCommandInputChange = (search: string) => {
    setInputValue(search);
  };

  const addEmail = (email: string) => {
    const trimmedEmail = email.trim();
    if (trimmedEmail && isValidEmail(trimmedEmail) && !value.includes(trimmedEmail)) {
      onChange([...value, trimmedEmail]);
      setInputValue("");
      setOpen(false);
    }
  };

  // Handle Enter key for email creation
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === "Tab") && inputValue.trim()) {
      e.preventDefault();
      const exists = options.some(
        (option) => option.value.toLowerCase() === inputValue.trim().toLowerCase()
      );
      if (exists) {
        // If already exists in options, just select it
        handleSelect(inputValue.trim());
        setInputValue("");
      } else if (isValidEmail(inputValue.trim())) {
        // If it's a valid email, add it
        addEmail(inputValue.trim());
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-10"
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedOptions.length > 0 ? (
              selectedOptions.map((option, index) => (
                <Badge
                  key={`selected-${index}-${option.value}`}
                  variant="secondary"
                  className="mr-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(option.value);
                  }}
                >
                  {option.label}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-80">
        <Command>
          <form autoComplete="off" onSubmit={e => e.preventDefault()}>
            <CommandInput
              placeholder="Enter a name or email"
              value={inputValue}
              onValueChange={handleCommandInputChange}
              onKeyDown={handleInputKeyDown}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-dashlane-ignore="true"
              name={`ignore-chrome-autofill-${Math.random().toString(36).substr(2, 9)}`}
              role="combobox"
            />
          </form>
          <CommandList
            className="max-h-60 overflow-y-auto"
            style={{ maxHeight: '240px', overflowY: 'auto' }}
            onWheel={(e) => {
              e.preventDefault();
              const target = e.currentTarget;
              target.scrollTop += e.deltaY;
            }}
          >
            <CommandEmpty>
              {!isValidEmail(inputValue.trim()) 
                ? "No matches found - Try using their email instead" 
                : "No results found."
              }
            </CommandEmpty>
            <CommandGroup>
              {options.map((option, index) => (
                <CommandItem
                  key={`option-${index}-${option.value}`}
                  value={option.value}
                  onSelect={handleSelect}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value.includes(option.value) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.description && (
                      <span className="text-sm text-muted-foreground">{option.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {/* Show invite option if inputValue is a valid email and not already selected */}
              {inputValue.trim() && isValidEmail(inputValue.trim()) && !value.includes(inputValue.trim()) && !options.some(option => option.value.toLowerCase() === inputValue.trim().toLowerCase()) && (
                <CommandItem
                  key={"invite-" + inputValue.trim()}
                  value={inputValue.trim()}
                  onSelect={() => addEmail(inputValue.trim())}
                >
                  <div className="flex items-center">
                    <span className="text-primary font-semibold">Invite {inputValue.trim()}</span>
                    <span className="ml-auto text-xs text-muted-foreground">Press Enter</span>
                  </div>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
} 