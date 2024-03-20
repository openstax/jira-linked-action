const core = require('@actions/core');

try {
  const nameToGreet = core.getInput('jira-project');
  core.setOutput("hello", "world");
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = github.context.payload;

  console.log(`The event payload: ${JSON.stringify(payload, undefined, 2)}`);
} catch (error) {
  core.setFailed(error.message);
}
