export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};

    res.status(200).json({
      workflow: body.workflow ?? null,
      executionPlan: body.executionPlan ?? null,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid export payload.',
    });
  }
}
