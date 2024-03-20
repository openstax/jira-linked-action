import core from '@actions/core';
import api, { route } from "@forge/api";

/*
 * jira docs:
 *  https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-search/#api-rest-api-2-search-id-post
 *
 *
 * creating a javascript github action:
 *  https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action
 */
try {
  const project = core.getInput('jira-project');
  core.setOutput("hello", "world");
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = github.context.payload;

  var bodyData = `{
    "jql": "project = ${project}",
    "maxResults": 1000,
    "nextPageToken": "EgQIlMIC"
  }`;

  const response = await api.asUser().requestJira(route`/rest/api/2/search/id`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: bodyData
  });

  console.log(`Response: ${response.status} ${response.statusText}`);
  console.log(await response.json());

  console.log(`The event payload: ${JSON.stringify(payload, undefined, 2)}`);
} catch (error) {
  core.setFailed(error.message);
}
