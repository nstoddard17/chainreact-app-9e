"use client"

import { useReducer, useCallback, useEffect } from 'react';
import { FormState, FormAction } from '../utils/types';
import { validateAllRequiredFields } from '../utils/validation';
import { NodeComponent } from '@/lib/workflows/availableNodes';

/**
 * Form state reducer function
 */
const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case 'SET_VALUE':
      return {
        ...state,
        values: {
          ...state.values,
          [action.field]: action.value
        },
        touched: {
          ...state.touched,
          [action.field]: true
        },
        isDirty: true
      };

    case 'SET_VALUES':
      return {
        ...state,
        values: action.values,
        isDirty: true
      };

    case 'SET_ERROR':
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.field]: action.error
        },
        isValid: false
      };

    case 'CLEAR_ERROR':
      const newErrors = { ...state.errors };
      delete newErrors[action.field];
      return {
        ...state,
        errors: newErrors,
        isValid: Object.keys(newErrors).length === 0
      };

    case 'SET_TOUCHED':
      return {
        ...state,
        touched: {
          ...state.touched,
          [action.field]: true
        }
      };

    case 'RESET':
      return {
        values: action.values,
        errors: {},
        touched: {},
        isValid: true,
        isDirty: false
      };

    case 'VALIDATE':
      // This is a placeholder. Actual validation is handled in the hook.
      return state;

    default:
      return state;
  }
};

/**
 * Custom hook for form state management
 */
export const useFormState = (
  initialValues: Record<string, any>,
  nodeInfo: NodeComponent | null
) => {
  // Initialize form state
  const [state, dispatch] = useReducer(formReducer, {
    values: initialValues,
    errors: {},
    touched: {},
    isValid: true,
    isDirty: false
  });

  // Validate the form when values change
  const validate = useCallback(() => {
    const errors = validateAllRequiredFields(nodeInfo, state.values);
    const isValid = Object.keys(errors).length === 0;
    
    // Only update if there are actual errors (avoid unnecessary renders)
    if (!isValid) {
      Object.entries(errors).forEach(([field, error]) => {
        dispatch({ type: 'SET_ERROR', field, error });
      });
    }
    
    return isValid;
  }, [nodeInfo, state.values]);

  // Set a single form value
  const setValue = useCallback((field: string, value: any) => {
    dispatch({ type: 'SET_VALUE', field, value });
  }, []);

  // Set multiple form values at once
  const setValues = useCallback((values: Record<string, any>) => {
    dispatch({ type: 'SET_VALUES', values });
  }, []);

  // Reset the form to initial values or new values
  const resetForm = useCallback((values: Record<string, any> = initialValues) => {
    dispatch({ type: 'RESET', values });
  }, [initialValues]);

  // Handle form submission
  const handleSubmit = useCallback(
    (onSubmit: (values: Record<string, any>) => void) => {
      return (e?: React.FormEvent) => {
        if (e) {
          e.preventDefault();
        }

        const isValid = validate();
        if (isValid) {
          onSubmit(state.values);
        }
      };
    },
    [state.values, validate]
  );

  // Reset form when initialValues change
  useEffect(() => {
    resetForm(initialValues);
  }, [initialValues, resetForm]);

  return {
    values: state.values,
    errors: state.errors,
    touched: state.touched,
    isValid: state.isValid,
    isDirty: state.isDirty,
    setValue,
    setValues,
    resetForm,
    validate,
    handleSubmit
  };
};