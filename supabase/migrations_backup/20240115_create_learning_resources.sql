-- Create learning_resources table
CREATE TABLE IF NOT EXISTS public.learning_resources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('documentation', 'video', 'tutorial', 'community')),
  url TEXT NOT NULL,
  icon TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  order_index INTEGER DEFAULT 0
);

-- Add RLS policies
ALTER TABLE public.learning_resources ENABLE ROW LEVEL SECURITY;

-- Policy for reading (everyone can read)
CREATE POLICY "Anyone can view learning resources" ON public.learning_resources
  FOR SELECT USING (true);

-- Policy for inserting (only admins) - simplified for now
CREATE POLICY "Admins can insert learning resources" ON public.learning_resources
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Policy for updating (only admins) - simplified for now
CREATE POLICY "Admins can update learning resources" ON public.learning_resources
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
  );

-- Policy for deleting (only admins) - simplified for now
CREATE POLICY "Admins can delete learning resources" ON public.learning_resources
  FOR DELETE USING (
    auth.uid() IS NOT NULL
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_learning_resources_updated_at
  BEFORE UPDATE ON public.learning_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert default resources
INSERT INTO public.learning_resources (title, description, type, url, icon, category, order_index) VALUES
  ('Getting Started Guide', 'Learn the basics of ChainReact and create your first workflow', 'documentation', 'https://docs.chainreact.ai/getting-started', 'BookOpen', 'Basics', 1),
  ('Workflow Fundamentals', 'Understand nodes, connections, and workflow execution', 'tutorial', 'https://docs.chainreact.ai/workflows', 'Workflow', 'Basics', 2),
  ('Integration Setup', 'Connect your favorite apps and services to ChainReact', 'documentation', 'https://docs.chainreact.ai/integrations', 'Zap', 'Integrations', 3),
  ('AI Agent Configuration', 'Learn how to configure and use AI agents in your workflows', 'tutorial', 'https://docs.chainreact.ai/ai-agents', 'Bot', 'Advanced', 4),
  ('Video Tutorials', 'Watch step-by-step video guides for common use cases', 'video', 'https://youtube.com/chainreact', 'Video', 'Videos', 5),
  ('API Documentation', 'Build custom integrations using our REST API', 'documentation', 'https://docs.chainreact.ai/api', 'Code', 'Developer', 6),
  ('Community Forum', 'Join discussions, share workflows, and get help from the community', 'community', 'https://community.chainreact.ai', 'Users', 'Community', 7),
  ('Best Practices', 'Learn workflow design patterns and optimization techniques', 'tutorial', 'https://docs.chainreact.ai/best-practices', 'FileText', 'Advanced', 8);