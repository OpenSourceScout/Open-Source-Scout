import os
from dotenv import load_dotenv
load_dotenv()

from integrations.groq_client import GroqClient
from core.agents.senior_dev import SeniorDevAgent

client = GroqClient(api_key=os.environ.get("GROQ_API_KEY"))
agent = SeniorDevAgent(client)

ctx = {
    "repo": {"name": "test/test", "url": "http://", "description": "test", "default_branch": "main", "languages": ["Python"], "primary_language": "Python"},
    "issue": {"number": 1, "title": "Test Issue", "body": "test required", "url": "test", "labels": [], "created_at": "today", "updated_at": "today", "score": 100, "why_selected": []},
    "code_analysis": {"keywords": [], "confidence": "High", "files": [], "call_trace": "", "additional_files": []}
}

res = agent._generate_briefing(ctx)
print("RAW REPR:")
print(repr(res))
print("\nSTRING:")
print(res)
