# Let's find all files that import from lib/db or lib/db/schema
find . -name "*.ts" -o -name "*.tsx" | xargs grep -l "from.*lib/db" | head -10
find . -name "*.ts" -o -name "*.tsx" | xargs grep -l "from.*lib/db/schema" | head -10
