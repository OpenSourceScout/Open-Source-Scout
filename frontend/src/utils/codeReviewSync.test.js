import { describe, expect, it } from 'vitest'
import { sanitizeAnalysisResult, shouldShowCodeReviewer } from './codeReviewSync'

describe('codeReviewSync', () => {
  it('hides Code Reviewer from saved pipeline QA until editor review completes', () => {
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
        iterations_used: 1,
      },
    }

    const sanitized = sanitizeAnalysisResult(analysis)

    expect(shouldShowCodeReviewer(sanitized)).toBe(false)
    expect(sanitized.code_review_output).toBeUndefined()
    expect(sanitized.testing_output.agent_results.map((result) => result.agent_name)).toEqual([
      'Senior Dev',
    ])
    expect(sanitized.testing_output.retry_agents).toEqual(['Senior Dev'])
  })

  it('keeps Code Reviewer when editor review completed', () => {
    const analysis = {
      editor_code_review_completed: true,
      code_review_output: { overall_status: 'approved', summary: 'editor review' },
      testing_output: {
        overall_score: 70,
        overall_passed: true,
        agent_results: [
          { agent_name: 'Senior Dev', passed: true, score: 70 },
          { agent_name: 'Code Reviewer', passed: true, score: 70 },
        ],
        retry_agents: [],
        retry_recommended: false,
        summary: 'ok',
        iterations_used: 1,
      },
    }

    const sanitized = sanitizeAnalysisResult(analysis)
    expect(sanitized.testing_output.agent_results).toHaveLength(2)
  })
})
