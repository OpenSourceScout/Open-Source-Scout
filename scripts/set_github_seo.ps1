# Apply GitHub repository SEO metadata (description, homepage, topics).
# Requires: gh CLI — https://cli.github.com/ — run `gh auth login` first.

$ErrorActionPreference = "Stop"

$Repo = "SamarthPyati/Open-Source-Scout"
$Homepage = "https://open-source-scout.up.railway.app"
$Description = "AI-powered open source help for beginners: find good first issues, locate code, get contributor briefings & PR drafts."

Write-Host "Updating $Repo metadata..."

gh repo edit $Repo `
  --description $Description `
  --homepage $Homepage

$topics = @(
  "open-source",
  "good-first-issue",
  "beginners",
  "hacktoberfest",
  "contributor-friendly",
  "ai-agents",
  "langgraph",
  "groq",
  "fastapi",
  "react",
  "multi-agent",
  "first-contribution"
)

foreach ($topic in $topics) {
  gh repo edit $Repo --add-topic $topic
  Write-Host "  + topic: $topic"
}

Write-Host "Done. Verify at https://github.com/$Repo"
