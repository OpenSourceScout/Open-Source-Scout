export const CODE_REVIEW_SYNC_KEY = 'scout_code_review_sync'

function stripCodeReviewerQa(reviewPayload) {
  if (!reviewPayload || typeof reviewPayload !== 'object') return null
  const { code_reviewer_qa: _qa, ...codeReviewOutput } = reviewPayload
  return codeReviewOutput
}

export function mergeCodeReviewIntoAnalysis(analysisResult, reviewPayload) {
  if (!analysisResult || !reviewPayload?.code_reviewer_qa) {
    return analysisResult
  }

  const codeReviewOutput = stripCodeReviewerQa(reviewPayload)
  const codeReviewerQa = reviewPayload.code_reviewer_qa
  const testing = analysisResult.testing_output
    ? { ...analysisResult.testing_output }
    : null

  if (!testing) {
    return {
      ...analysisResult,
      code_review_output: codeReviewOutput,
    }
  }

  const agentResults = (testing.agent_results || []).filter(
    (result) => result.agent_name !== 'Code Reviewer',
  )
  agentResults.push(codeReviewerQa)

  const overallScore = Math.floor(
    agentResults.reduce((sum, result) => sum + result.score, 0) / agentResults.length,
  )
  const overallPassed = agentResults.every((result) => result.passed)
  const failedAgents = agentResults.filter((result) => !result.passed).map((result) => result.agent_name)

  return {
    ...analysisResult,
    code_review_output: codeReviewOutput,
    testing_output: {
      ...testing,
      agent_results: agentResults,
      overall_score: overallScore,
      overall_passed: overallPassed,
      retry_recommended: !overallPassed,
      retry_agents: failedAgents,
    },
  }
}

export function publishCodeReviewSync(mergedAnalysis) {
  try {
    localStorage.setItem(
      CODE_REVIEW_SYNC_KEY,
      JSON.stringify({
        ts: Date.now(),
        analysisResult: mergedAnalysis,
      }),
    )
  } catch {
    /* ignore quota errors */
  }
}

export function subscribeCodeReviewSync(callback) {
  const handler = (event) => {
    if (event.key !== CODE_REVIEW_SYNC_KEY || !event.newValue) return
    try {
      callback(JSON.parse(event.newValue))
    } catch {
      /* ignore malformed payloads */
    }
  }

  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export function getVisibleAgentResults(testingOutput, hasCodeReview) {
  const agentResults = testingOutput?.agent_results || []
  if (hasCodeReview) return agentResults
  return agentResults.filter((result) => result.agent_name !== 'Code Reviewer')
}

export function getVisibleTestingSummary(testingOutput, hasCodeReview) {
  if (!testingOutput) return null

  const agentResults = getVisibleAgentResults(testingOutput, hasCodeReview)
  if (agentResults.length === 0) return testingOutput

  const overallScore = Math.floor(
    agentResults.reduce((sum, result) => sum + result.score, 0) / agentResults.length,
  )
  const overallPassed = agentResults.every((result) => result.passed)

  return {
    ...testingOutput,
    agent_results: agentResults,
    overall_score: overallScore,
    overall_passed: overallPassed,
    retry_agents: (testingOutput.retry_agents || []).filter((name) => name !== 'Code Reviewer'),
    retry_recommended:
      !overallPassed ||
      (testingOutput.retry_agents || []).some((name) => name !== 'Code Reviewer'),
  }
}
