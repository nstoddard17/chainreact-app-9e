-- Update all learning resource URLs from .ai to .app domain
UPDATE public.learning_resources
SET url = REPLACE(url, 'chainreact.ai', 'chainreact.app')
WHERE url LIKE '%chainreact.ai%';

-- Also update the YouTube URL format if it exists
UPDATE public.learning_resources
SET url = 'https://youtube.com/@chainreact'
WHERE url = 'https://youtube.com/chainreact';