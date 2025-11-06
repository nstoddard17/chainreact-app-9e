"use client"

import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, CalendarDays, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfigurationContainer } from '../components/ConfigurationContainer';

interface ScheduleConfigurationProps {
  values: Record<string, any>;
  errors: Record<string, string>;
  setValue: (name: string, value: any) => void;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  isLoading: boolean;
  onCancel: () => void;
  onBack?: () => void;
  nodeInfo: any;
  isEditMode?: boolean;
}

export function ScheduleConfiguration({
  values,
  errors,
  setValue,
  onSubmit,
  isLoading,
  onCancel,
  onBack,
  nodeInfo,
  isEditMode = false
}: ScheduleConfigurationProps) {
  // State for schedule type
  const [scheduleType, setScheduleType] = useState<'once' | 'recurring' | 'advanced'>(
    values.scheduleType || 'once'
  );

  // Get user's timezone
  const getUserTimezone = () => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  };

  // Get timezone abbreviation
  const getTimezoneAbbr = (tz: string) => {
    // Create a date and get the timezone abbreviation
    const date = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: tz, timeZoneName: 'short' };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(part => part.type === 'timeZoneName');
    return tzPart?.value || tz;
  };

  // Generate time options for dropdown (every 15 minutes)
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const hourStr = hour.toString().padStart(2, '0');
        const minuteStr = minute.toString().padStart(2, '0');
        const time24 = `${hourStr}:${minuteStr}`;
        const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        const ampm = hour < 12 ? 'AM' : 'PM';
        const time12 = `${hour12}:${minuteStr} ${ampm}`;
        options.push({ value: time24, label: time12 });
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  // State for one-time schedule
  const [date, setDate] = useState(values.date || '');
  const [time, setTime] = useState(values.time || '09:00');

  // State for recurring schedule
  const [frequency, setFrequency] = useState(values.frequency || 'daily');
  const [recurringTime, setRecurringTime] = useState(values.recurringTime || '09:00');
  const [dayOfWeek, setDayOfWeek] = useState(values.dayOfWeek || '1'); // Monday
  const [dayOfMonth, setDayOfMonth] = useState(values.dayOfMonth || '1');

  // State for timezone - default to user's timezone
  const [timezone, setTimezone] = useState(values.timezone || getUserTimezone());

  // State for advanced cron
  const [cronExpression, setCronExpression] = useState(values.cron || '0 9 * * *');

  // Convert schedule settings to cron expression
  const generateCronExpression = () => {
    if (scheduleType === 'advanced') {
      return cronExpression;
    }

    if (scheduleType === 'once') {
      // For one-time schedules, we'll use a specific date/time
      // This will be handled differently in the backend
      return `once:${date}T${time}`;
    }

    // Recurring schedules - extract hour and minute from time string
    const [hr, min] = recurringTime.split(':').map(s => s.padStart(2, '0'));

    switch (frequency) {
      case 'hourly':
        return `${min} * * * *`; // Every hour at specified minute
      case 'daily':
        return `${min} ${hr} * * *`; // Every day at specified time
      case 'weekly':
        return `${min} ${hr} * * ${dayOfWeek}`; // Every week on specified day
      case 'monthly':
        return `${min} ${hr} ${dayOfMonth} * *`; // Every month on specified day
      default:
        return `${min} ${hr} * * *`; // Default to daily
    }
  };

  // Update values when settings change
  useEffect(() => {
    const cron = generateCronExpression();
    setValue('cron', cron);
    setValue('timezone', timezone);
    setValue('scheduleType', scheduleType);

    // Store additional metadata for UI reconstruction
    setValue('scheduleMetadata', {
      scheduleType,
      date,
      time,
      frequency,
      recurringTime,
      dayOfWeek,
      dayOfMonth
    });
  }, [scheduleType, date, time, frequency, recurringTime, dayOfWeek, dayOfMonth, timezone, cronExpression]);

  // Load saved metadata on mount
  useEffect(() => {
    if (values.scheduleMetadata) {
      const meta = values.scheduleMetadata;
      setScheduleType(meta.scheduleType || 'once');
      setDate(meta.date || '');
      setTime(meta.time || '09:00');
      setFrequency(meta.frequency || 'daily');
      setRecurringTime(meta.recurringTime || '09:00');
      setDayOfWeek(meta.dayOfWeek || '1');
      setDayOfMonth(meta.dayOfMonth || '1');
    }
  }, []);

  // Compute form validity
  const isFormValid = React.useMemo(() => {
    if (scheduleType === 'once') {
      return !!(date && time);
    }
    return true; // Recurring and advanced have defaults
  }, [scheduleType, date, time]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate based on schedule type
    if (scheduleType === 'once' && (!date || !time)) {
      alert('Please select both date and time for one-time schedule');
      return;
    }

    await onSubmit(values);
  };

  // Get tomorrow's date as minimum for date picker
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <ConfigurationContainer
      onSubmit={handleSave}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
      submitLabel={`${isEditMode ? 'Update' : 'Save'} Configuration`}
    >
      <div className="space-y-4">
            <Tabs value={scheduleType} onValueChange={(v: any) => setScheduleType(v)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="once">
                  <Calendar className="w-4 h-4 mr-2" />
                  One Time
                </TabsTrigger>
                <TabsTrigger value="recurring">
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Recurring
                </TabsTrigger>
                <TabsTrigger value="advanced">
                  <Clock className="w-4 h-4 mr-2" />
                  Advanced
                </TabsTrigger>
              </TabsList>

              <TabsContent value="once" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={minDate}
                className="mt-1"
                required={scheduleType === 'once'}
              />
            </div>

            <div>
              <Label htmlFor="time">Time</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger id="time" className="mt-1">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {timeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

              <TabsContent value="recurring" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="frequency">Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="frequency" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Every Hour</SelectItem>
                  <SelectItem value="daily">Every Day</SelectItem>
                  <SelectItem value="weekly">Every Week</SelectItem>
                  <SelectItem value="monthly">Every Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="recurringTime">
                {frequency === 'hourly' ? 'Start Time' : 'Time'}
              </Label>
              <Select value={recurringTime} onValueChange={setRecurringTime}>
                <SelectTrigger id="recurringTime" className="mt-1">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {timeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {frequency === 'hourly' && (
                <p className="text-sm text-gray-500 mt-1">
                  Will run every hour starting at {recurringTime}
                </p>
              )}
            </div>

            {frequency === 'weekly' && (
              <div>
                <Label htmlFor="dayOfWeek">Day of Week</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger id="dayOfWeek" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sunday</SelectItem>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem>
                    <SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {frequency === 'monthly' && (
              <div>
                <Label htmlFor="dayOfMonth">Day of Month (1-31)</Label>
                <Input
                  id="dayOfMonth"
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
          </TabsContent>

              <TabsContent value="advanced" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="cron">Cron Expression</Label>
              <Input
                id="cron"
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                className="mt-1"
                placeholder="0 9 * * * (runs daily at 9:00 AM)"
              />
              <p className="text-sm text-gray-500 mt-1">
                Format: minute hour day month weekday
              </p>
              <div className="text-sm text-gray-500 mt-2 space-y-1">
                <p>Examples:</p>
                <p className="font-mono">0 * * * * - Every hour</p>
                <p className="font-mono">0 9 * * * - Daily at 9:00 AM</p>
                <p className="font-mono">0 9 * * 1 - Every Monday at 9:00 AM</p>
                <p className="font-mono">0 9 1 * * - First day of month at 9:00 AM</p>
              </div>
            </div>
              </TabsContent>
            </Tabs>

            <div className="border-t border-slate-200 pt-4 mt-6">
              <h3 className="text-sm font-medium text-slate-700 mb-3">General Settings</h3>
              <div className="space-y-3">
                <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="timezone" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UTC">UTC</SelectItem>
              <SelectItem value="America/New_York">Eastern Time</SelectItem>
              <SelectItem value="America/Chicago">Central Time</SelectItem>
              <SelectItem value="America/Denver">Mountain Time</SelectItem>
              <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
              <SelectItem value="Europe/London">London</SelectItem>
              <SelectItem value="Europe/Paris">Paris</SelectItem>
              <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
              <SelectItem value="Asia/Shanghai">Shanghai</SelectItem>
              <SelectItem value="Australia/Sydney">Sydney</SelectItem>
            </SelectContent>
          </Select>
                </div>

                {/* Display the generated schedule summary */}
                {scheduleType === 'recurring' && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-medium mb-1">Schedule Summary:</p>
                      <p className="text-sm">
                        {frequency === 'hourly' && `Every hour at ${recurringTime.split(':')[1]} minutes past the hour ${getTimezoneAbbr(timezone)}`}
                        {frequency === 'daily' && `Every day at ${timeOptions.find(opt => opt.value === recurringTime)?.label || recurringTime} ${getTimezoneAbbr(timezone)}`}
                        {frequency === 'weekly' && `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseInt(dayOfWeek)]} at ${timeOptions.find(opt => opt.value === recurringTime)?.label || recurringTime} ${getTimezoneAbbr(timezone)}`}
                        {frequency === 'monthly' && `Day ${dayOfMonth} of every month at ${timeOptions.find(opt => opt.value === recurringTime)?.label || recurringTime} ${getTimezoneAbbr(timezone)}`}
                      </p>
                    </AlertDescription>
                  </Alert>
                )}

                {scheduleType === 'advanced' && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-medium mb-1">Cron Schedule:</p>
                      <p className="font-mono text-sm">
                        {cronExpression} {getTimezoneAbbr(timezone)}
                      </p>
                    </AlertDescription>
                  </Alert>
                )}

                {scheduleType === 'once' && date && time && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-medium mb-1">One-time Schedule:</p>
                      <p className="text-sm">
                        {new Date(`${date}T${time}`).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })} at {timeOptions.find(opt => opt.value === time)?.label || time} {getTimezoneAbbr(timezone)}
                      </p>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </div>
    </ConfigurationContainer>
  );
}