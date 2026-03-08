"""
Agent 0: Pathfinder - Repository discovery and ranking based on user's tech stack.
"""
from typing import List, Optional, Dict
import json
import re

from core.agents.base import BaseAgent
from core.schemas import (
    RankedRepo, RepoScoreBreakdown, PathfinderOutput
)
from integrations.groq_client import GroqClient


class PathfinderAgent(BaseAgent):
    """
    Agent 0: Pathfinder
    
    Responsible for:
    - Searching GitHub for repositories matching the user's tech stack
    - Scoring repositories based on multiple criteria
    - Ranking and presenting top 5 repositories
    - Providing detailed information for user selection
    
    Scoring Criteria (0-100 total):
    - Tech Stack Match (40 pts): How well repo matches user's skills
    - Beginner Friendliness (25 pts): Good first issues, contributing guides
    - Activity Level (15 pts): Recent commits, active maintenance
    - Community Health (10 pts): Contributors, responsiveness
    - Issue Availability (10 pts): Number and quality of open issues
    """
    
    def __init__(
        self,
        groq_client: GroqClient,
        model: Optional[str] = None
    ):
        super().__init__(groq_client, model or "qwen-qwq-32b")
    
    @property
    def name(self) -> str:
        return "Pathfinder"
    
    @property
    def role_prompt(self) -> str:
        return """You are the Pathfinder agent, an expert at discovering and evaluating open-source repositories for beginner contributors.

Your role is to:
1. Analyze user's tech stack and skills to find matching repositories
2. Evaluate repositories based on contribution-friendliness
3. Provide clear explanations of why each repository is a good match
4. Help users find the perfect project to start their open-source journey

Focus on:
- Technology alignment with user skills
- Beginner-friendly contribution opportunities
- Active and welcoming communities
- Clear documentation and contribution guidelines

Be encouraging and help users find projects where they can make meaningful contributions."""
    
    def run(
        self,
        tech_stack: List[str],
        github_client,
        top_n: int = 5
    ) -> PathfinderOutput:
        """
        Search and rank repositories based on user's tech stack.
        
        Args:
            tech_stack: List of technologies/skills the user knows
            github_client: GitHub API client instance
            top_n: Number of top repositories to return
            
        Returns:
            PathfinderOutput with ranked repositories
        """
        self.log(f"Searching repositories for tech stack: {', '.join(tech_stack)}")
        
        # Normalize tech stack
        normalized_stack = [t.strip().lower() for t in tech_stack if t.strip()]
        
        if not normalized_stack:
            return PathfinderOutput(
                tech_stack=tech_stack,
                ranked_repos=[],
                search_queries_used=[]
            )
        
        # Generate search queries based on tech stack
        search_queries = self._generate_search_queries(normalized_stack)
        
        # Search GitHub for repositories
        all_repos = []
        for query in search_queries[:5]:  # Limit to 5 queries
            try:
                repos = github_client.search_repos(query, per_page=10)
                all_repos.extend(repos)
            except Exception as e:
                self.log(f"Search failed for query '{query}': {e}", level="warning")
        
        # Deduplicate by full_name
        seen = set()
        unique_repos = []
        for repo in all_repos:
            if repo.full_name not in seen:
                seen.add(repo.full_name)
                unique_repos.append(repo)
        
        self.log(f"Found {len(unique_repos)} unique repositories")
        
        if not unique_repos:
            return PathfinderOutput(
                tech_stack=tech_stack,
                ranked_repos=[],
                search_queries_used=search_queries
            )
        
        # Score and rank repositories
        ranked_repos = self._score_and_rank_repos(
            unique_repos, 
            normalized_stack,
            github_client,
            top_n
        )
        
        return PathfinderOutput(
            tech_stack=tech_stack,
            ranked_repos=ranked_repos,
            search_queries_used=search_queries
        )
    
    def _generate_search_queries(self, tech_stack: List[str]) -> List[str]:
        """Generate GitHub search queries based on tech stack."""
        queries = []
        
        # Map common tech names to search terms
        tech_mappings = {
            'python': 'language:python',
            'javascript': 'language:javascript',
            'js': 'language:javascript',
            'typescript': 'language:typescript',
            'ts': 'language:typescript',
            'java': 'language:java',
            'go': 'language:go',
            'golang': 'language:go',
            'rust': 'language:rust',
            'c++': 'language:cpp',
            'cpp': 'language:cpp',
            'c#': 'language:csharp',
            'csharp': 'language:csharp',
            'ruby': 'language:ruby',
            'php': 'language:php',
            'swift': 'language:swift',
            'kotlin': 'language:kotlin',
            'react': 'react language:javascript',
            'reactjs': 'react language:javascript',
            'vue': 'vue language:javascript',
            'vuejs': 'vue language:javascript',
            'angular': 'angular language:typescript',
            'node': 'nodejs language:javascript',
            'nodejs': 'nodejs language:javascript',
            'express': 'express language:javascript',
            'django': 'django language:python',
            'flask': 'flask language:python',
            'fastapi': 'fastapi language:python',
            'spring': 'spring language:java',
            'rails': 'rails language:ruby',
            'laravel': 'laravel language:php',
        }
        
        # Build queries combining tech stack
        for tech in tech_stack:
            tech_lower = tech.lower()
            if tech_lower in tech_mappings:
                # Add good-first-issue filter for beginner friendliness
                queries.append(f'{tech_mappings[tech_lower]} good-first-issues:>5 stars:>100')
                queries.append(f'{tech_mappings[tech_lower]} help-wanted-issues:>3 stars:>50')
            else:
                # Generic search
                queries.append(f'{tech} good-first-issues:>3 stars:>50')
        
        # Combine multiple techs for more specific searches
        if len(tech_stack) >= 2:
            combined = ' '.join(tech_stack[:2])
            queries.append(f'{combined} good-first-issues:>3 stars:>50')
        
        return queries[:8]  # Return max 8 queries
    
    def _score_and_rank_repos(
        self,
        repos: list,
        user_stack: List[str],
        github_client,
        top_n: int
    ) -> List[RankedRepo]:
        """Score repositories and return top N ranked."""
        scored_repos = []
        
        for repo in repos:
            try:
                score_result = self._calculate_repo_score(repo, user_stack, github_client)
                scored_repos.append((repo, score_result))
            except Exception as e:
                self.log(f"Failed to score {repo.full_name}: {e}", level="warning")
        
        # Sort by total score descending
        scored_repos.sort(key=lambda x: x[1]['total'], reverse=True)
        
        # Build ranked repo objects for top N
        ranked = []
        for repo, score_result in scored_repos[:top_n]:
            # Get enhanced description from LLM
            why_match = self._generate_match_reasons(repo, user_stack, score_result)
            
            ranked.append(RankedRepo(
                full_name=repo.full_name,
                url=repo.html_url,
                description=repo.description or "No description available",
                language=repo.language,
                stars=repo.stargazers_count,
                open_issues=repo.open_issues_count,
                score_total=score_result['total'],
                score_breakdown=RepoScoreBreakdown(
                    tech_match=score_result['tech_match'],
                    beginner_friendliness=score_result['beginner_friendliness'],
                    activity=score_result['activity'],
                    community=score_result['community'],
                    issue_availability=score_result['issue_availability']
                ),
                why_match=why_match,
                topics=getattr(repo, 'topics', []) or []
            ))
        
        return ranked
    
    def _calculate_repo_score(
        self,
        repo,
        user_stack: List[str],
        github_client
    ) -> Dict[str, int]:
        """
        Calculate repository score based on multiple criteria.
        
        Returns dict with breakdown and total score.
        """
        scores = {
            'tech_match': 0,
            'beginner_friendliness': 0,
            'activity': 0,
            'community': 0,
            'issue_availability': 0,
            'total': 0
        }
        
        # 1. Tech Stack Match (0-40 points)
        tech_match_score = 0
        repo_language = (repo.language or '').lower()
        repo_languages = {k.lower(): v for k, v in getattr(repo, 'languages', {}).items()}
        repo_topics = [t.lower() for t in getattr(repo, 'topics', []) or []]
        
        # Primary language match (20 pts)
        for tech in user_stack:
            if tech in repo_language or repo_language in tech:
                tech_match_score += 20
                break
        
        # Secondary languages/topics match (10 pts each, max 20)
        secondary_matches = 0
        for tech in user_stack:
            if tech in repo_languages:
                secondary_matches += 1
            if tech in repo_topics or any(tech in topic for topic in repo_topics):
                secondary_matches += 1
        tech_match_score += min(secondary_matches * 5, 20)
        
        scores['tech_match'] = min(tech_match_score, 40)
        
        # 2. Beginner Friendliness (0-25 points)
        beginner_score = 0
        
        # Check for good first issues (estimated from open_issues and topics)
        if repo.open_issues_count > 5:
            beginner_score += 10
        elif repo.open_issues_count > 2:
            beginner_score += 5
        
        # Check topics for beginner-friendly indicators
        beginner_topics = ['hacktoberfest', 'good-first-issue', 'beginner-friendly', 'contributions-welcome']
        for topic in repo_topics:
            if any(bt in topic for bt in beginner_topics):
                beginner_score += 5
                break
        
        # Stars as proxy for documentation quality (popular repos tend to have better docs)
        if repo.stargazers_count > 1000:
            beginner_score += 10
        elif repo.stargazers_count > 100:
            beginner_score += 5
        
        scores['beginner_friendliness'] = min(beginner_score, 25)
        
        # 3. Activity Level (0-15 points)
        activity_score = 0
        
        # Use stars and issues as activity proxies
        if repo.stargazers_count > 500:
            activity_score += 5
        if repo.open_issues_count > 0 and repo.open_issues_count < 500:
            activity_score += 5
        # Assume repos with many stars are well-maintained
        if repo.stargazers_count > 100:
            activity_score += 5
        
        scores['activity'] = min(activity_score, 15)
        
        # 4. Community Health (0-10 points)
        community_score = 0
        
        # Stars indicate community size
        if repo.stargazers_count > 1000:
            community_score += 5
        elif repo.stargazers_count > 100:
            community_score += 3
        
        # Reasonable issue count suggests active discussion
        if 5 <= repo.open_issues_count <= 200:
            community_score += 5
        
        scores['community'] = min(community_score, 10)
        
        # 5. Issue Availability (0-10 points)
        issue_score = 0
        
        # Optimal range of issues (not too few, not too many)
        if 10 <= repo.open_issues_count <= 100:
            issue_score += 10
        elif 5 <= repo.open_issues_count <= 200:
            issue_score += 7
        elif repo.open_issues_count > 0:
            issue_score += 3
        
        scores['issue_availability'] = min(issue_score, 10)
        
        # Calculate total
        scores['total'] = (
            scores['tech_match'] +
            scores['beginner_friendliness'] +
            scores['activity'] +
            scores['community'] +
            scores['issue_availability']
        )
        
        return scores
    
    def _generate_match_reasons(
        self,
        repo,
        user_stack: List[str],
        score_result: dict
    ) -> List[str]:
        """Generate human-readable reasons why this repo matches the user."""
        try:
            prompt = f"""Given this GitHub repository and the user's tech stack, provide 3-4 concise bullet points explaining why this is a good match.

Repository: {repo.full_name}
Description: {repo.description or 'No description'}
Primary Language: {repo.language or 'Unknown'}
Stars: {repo.stargazers_count}
Open Issues: {repo.open_issues_count}

User's Tech Stack: {', '.join(user_stack)}

Score Breakdown:
- Tech Match: {score_result['tech_match']}/40
- Beginner Friendliness: {score_result['beginner_friendliness']}/25
- Activity: {score_result['activity']}/15
- Community: {score_result['community']}/10
- Issue Availability: {score_result['issue_availability']}/10
- Total: {score_result['total']}/100

Respond with a JSON object containing a "reasons" array of 3-4 short, specific bullet points. Focus on:
1. How the repo matches their tech stack
2. Why it's good for beginners
3. Community/activity highlights
4. Available opportunities

Example format:
{{"reasons": ["Uses Python/FastAPI matching your skills", "Active community with 1000+ stars", "15 good-first-issue labeled issues available", "Well-documented contribution guidelines"]}}"""

            response = self.groq.complete(
                prompt=prompt,
                model=self.model,
                system_prompt=self.role_prompt,
                temperature=0.3,
                max_tokens=300
            )
            
            # Parse JSON response
            json_match = re.search(r'\{[^{}]*"reasons"[^{}]*\}', response, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                return data.get('reasons', self._fallback_reasons(repo, user_stack))
            
            return self._fallback_reasons(repo, user_stack)
            
        except Exception as e:
            self.log(f"Failed to generate reasons: {e}", level="warning")
            return self._fallback_reasons(repo, user_stack)
    
    def _fallback_reasons(self, repo, user_stack: List[str]) -> List[str]:
        """Generate fallback reasons without LLM."""
        reasons = []
        
        if repo.language:
            if repo.language.lower() in [t.lower() for t in user_stack]:
                reasons.append(f"Uses {repo.language} matching your skills")
            else:
                reasons.append(f"Primary language: {repo.language}")
        
        if repo.stargazers_count > 100:
            reasons.append(f"Popular project with {repo.stargazers_count:,} stars")
        
        if repo.open_issues_count > 0:
            reasons.append(f"{repo.open_issues_count} open issues to contribute to")
        
        if not reasons:
            reasons.append("Potential contribution opportunity")
        
        return reasons[:4]
