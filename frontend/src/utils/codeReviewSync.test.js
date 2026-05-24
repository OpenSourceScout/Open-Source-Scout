import { describe, expect, it } from 'vitest'
import {
  getQaDisplayResults,
  mergeCodeReviewIntoAnalysis,
  sanitizeAnalysisResult,
} from './codeReviewSync'

describe('codeReviewSync', () => {
  it('always removes Code Reviewer from pipeline QA data', () => {
    const analysis = {
      code_review_output: { overall_status: 'approved', summary: 'old pipeline data' },
      testing_output: {
        overall_score: 60,
        overall_passed: false,
        agent_results: [
          { agent_name: 'Senior Dev', passed: false, score: 50 },
          { agent_name: 'Code Reviewer', passed: true, score: 70 },
        ],
        retry_agents: ['Senior Dev', 'Code Reviewer'],
        retry_recommended: true,
        summary: 'Pipeline QA Status: NEEDS IMPROVEMENT',
        iterations_used: 2,
      },
    }

    const sanitized = sanitizeAnalysisResult(analysis)
    const { agentResults, testing } = getQaDisplayResults(sanitized)

    expect(sanitized.code_review_output).toBeUndefined()
    expect(agentResults.map((result) => result.agent_name)).toEqual(['Senior Dev'])
    expect(testing.retry_agents).toEqual(['Senior Dev'])
  })

  it('shows Code Reviewer only from editor_code_reviewer_qa', () => {
    const analysis = mergeCodeReviewIntoAnalysis(
      {
        testing_output: {
          overall_score: 60,
          overall_passed: false,
          agent_results: [{ agent_name: 'Senior Dev', passed: false, score: 50 }],
          retry_agents: ['Senior Dev'],
          retry_recommended: true,
          summary: 'Pipeline QA Status: NEEDS IMPROVEMENT',
          iterations_used: 1,
        },
      },
      {
        overall_status: 'needs_improvement',
        summary: 'Editor review',
        code_reviewer_qa: {
          agent_name: 'Code Reviewer',
          passed: false,
          score: 55,
          issues_found: ['Missing permission check'],
          suggestions: ['Add hasPermission guard'],
          details: 'Editor QA',
        },
      },
    )

    const { agentResults } = getQaDisplayResults(analysis)

    expect(agentResults).toHaveLength(2)
    expect(agentResults[1].agent_name).toBe('Code Reviewer')
    expect(agentResults[1].score).toBe(55)
    expect(analysis.testing_output.agent_results).toHaveLength(1)
  })
})
