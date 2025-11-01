/**
 * Field type icons for Monday.com-style field indicators
 */

export function TextIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill="currentColor"
      >
        T
      </text>
    </svg>
  )
}

export function NumberIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="14"
        fontWeight="600"
        fill="currentColor"
      >
        #
      </text>
    </svg>
  )
}

export function StringIcon({ className = "w-4 h-4" }: { className?: string}) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill="currentColor"
      >
        Aa
      </text>
    </svg>
  )
}

export function BooleanIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      {/* Toggle switch - on state */}
      <rect x="2" y="5" width="12" height="6" rx="3" fill="currentColor" opacity="0.2" />
      <circle cx="11" cy="8" r="2.5" fill="currentColor" />
    </svg>
  )
}

export function DropdownIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <path d="M4 6l4 4 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Get the appropriate icon component based on field type
 */
export function getFieldTypeIcon(fieldType: string): React.FC<{ className?: string }> {
  const type = fieldType.toLowerCase()

  if (type.includes('bool') || type === 'toggle' || type === 'checkbox') {
    return BooleanIcon
  }

  if (type.includes('num') || type.includes('int') || type.includes('float') || type === 'number') {
    return NumberIcon
  }

  if (type === 'string' || type === 'mixed') {
    return StringIcon
  }

  if (type.includes('select') || type.includes('dropdown') || type.includes('option')) {
    return DropdownIcon
  }

  // Default to text icon
  return TextIcon
}
