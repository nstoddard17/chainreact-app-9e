import React from 'react';
import Gmail from '@/public/integrations/gmail.svg';
import GoogleCalendar from '@/public/integrations/google-calendar.svg';
import GoogleDrive from '@/public/integrations/google-drive.svg';
import GoogleSheets from '@/public/integrations/google-sheets.svg';
import Slack from '@/public/integrations/slack.svg';
import Notion from '@/public/integrations/notion.svg';
import GitHub from '@/public/integrations/github.svg';
import Stripe from '@/public/integrations/stripe.svg';
import YouTube from '@/public/integrations/youtube.svg';
import MicrosoftTeams from '@/public/integrations/teams.svg';
import OneDrive from '@/public/integrations/onedrive.svg';
import Twitter from '@/public/integrations/twitter.svg';
import Facebook from '@/public/integrations/facebook.svg';
import Instagram from '@/public/integrations/instagram.svg';
import TikTok from '@/public/integrations/tiktok.svg';
import LinkedIn from '@/public/integrations/linkedin.svg';
import Trello from '@/public/integrations/trello.svg';
import Shopify from '@/public/integrations/shopify.svg';
import GitLab from '@/public/integrations/gitlab.svg';
import Dropbox from '@/public/integrations/dropbox.svg';
import Box from '@/public/integrations/box.svg';
import Airtable from '@/public/integrations/airtable.svg';
import Mailchimp from '@/public/integrations/mailchimp.svg';
import HubSpot from '@/public/integrations/hubspot.svg';

export const integrationIcons: Record<string, React.ElementType> = {
  gmail: Gmail,
  'google-calendar': GoogleCalendar,
  'google-drive': GoogleDrive,
  'google-sheets': GoogleSheets,
  slack: Slack,
  notion: Notion,
  github: GitHub,
  stripe: Stripe,
  youtube: YouTube,
  teams: MicrosoftTeams,
  onedrive: OneDrive,
  twitter: Twitter,
  facebook: Facebook,
  instagram: Instagram,
  tiktok: TikTok,
  linkedin: LinkedIn,
  trello: Trello,
  shopify: Shopify,
  gitlab: GitLab,
  dropbox: Dropbox,
  box: Box,
  airtable: Airtable,
  mailchimp: Mailchimp,
  hubspot: HubSpot,
}; 