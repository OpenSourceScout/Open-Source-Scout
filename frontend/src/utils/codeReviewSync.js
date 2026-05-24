export const CODE_REVIEW_SYNC_KEY = 'scout_code_review_sync'

export function isCodeReviewerAgent(name) {
  return typeof name === 'string' && name.trim().toLowerCase() === 'code reviewer'
}

function stripCodeReviewerQa(reviewPayload) {
  if (!reviewPayload || typeof reviewPayload !== 'object') return null
  const { code_reviewer_qa: _qa, ...codeReviewOutput } = reviewPayload
  return codeReviewOutput
}

export function stripCodeReviewerFromTesting(testingOutput) {
  if (!testingOutput) return testingOutput

  const agentResults = (testingOutput.agent_results || []).filter(
    (result) => !isCodeReviewerAgent(result.agent_name),
  )
  if (agentResults.length === (testingOutput.agent_results || []).length) {
    return {
      ...testingOutput,
      retry_agents: (testingOutput.retry_agents || []).filter((name) => !isCodeReviewerAgent(name)),
    }
  }

  const overallScore = agentResults.length
    ? Math.floor(agentResults.reduce((sum, result) => sum + result.score, 0) / agentResults.length)
    : testingOutput.overall_score
  const overallPassed = agentResults.length
    ? agentResults.every((result) => result.passed)
    : testingOutput.overall_passed
  const retryAgents = (testingOutput.retry_agents || []).filter((name) => !isCodeReviewerAgent(name))

  return {
    ...testingOutput,
    agent_results: agentResults,
    overall_score: overallScore,
    overall_passed: overallPassed,
    retry_agents: retryAgents,
    retry_recommended: !overallPassed || retryAgents.length > 0,
  }
}

export function sanitizeAnalysisResult(analysisResult) {
  if (!analysisResult) return analysisResult

  const next = { ...analysisResult }

  if (next.testing_output) {
    next.testing_output = stripCodeReviewerFromTesting(next.testing_output)
  }

  if (!next.editor_code_reviewer_qa) {
    delete next.editor_code_reviewer_qa
    delete next.code_review_output
    delete next.editor_code_review_completed
  }

  return next
}

export function mergeCodeReviewIntoAnalysis(analysisResult, reviewPayload) {
  if (!analysisResult || !reviewPayload?.code_reviewer_qa) {
    return analysisResult
  }

  const sanitized = sanitizeAnalysisResult(analysisResult)

  return {
    ...sanitized,
    code_review_output: stripCodeReviewerQa(reviewPayload),
    editor_code_reviewer_qa: reviewPayload.code_reviewer_qa,
    editor_code_review_completed: true,
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

export function getPipelineTestingSummary(testingOutput) {
  return stripCodeReviewerFromTesting(testingOutput)
}

export function getQaDisplayResults(analysisResult) {
  const pipeline = getPipelineTestingSummary(analysisResult?.testing_output)
  const pipelineResults = pipeline?.agent_results || []
  const editorQa = analysisResult?.editor_code_reviewer_qa

  if (!editorQa) {
    return { testing: pipeline, agentResults: pipelineResults }
  }

  return {
    testing: pipeline,
    agentResults: [...pipelineResults, editorQa],
  }
}
