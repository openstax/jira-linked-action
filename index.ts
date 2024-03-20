import * as core from '@actions/core';
import * as github from '@actions/github';
import fetch from 'node-fetch';

/*
 * jira docs:
 *  https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-search/#api-rest-api-2-search-id-post
 *
 *
 * creating a javascript github action:
 *  https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action
 */
const doCheck = async() => {
  const site = core.getInput('jira-site');
  const project = core.getInput('jira-project');
  const authEmail = core.getInput('jira-email');
  const authToken = core.getInput('jira-token');
  core.setOutput("hello", "world");
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = github.context.payload;
  console.log(`The event payload: ${JSON.stringify(payload, undefined, 2)}`);

  const bodyData = JSON.stringify({
    jql: `project = ${project} and resolution is empty and development[pullrequests].open > 0`,
    maxResults: 1000
  });

  const response = await fetch(`https://${site}.atlassian.net/rest/api/2/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(
        `${authEmail}:${authToken}`
      ).toString('base64')}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: bodyData
  });

  console.log(`Response: ${response.status} ${response.statusText}`);
  console.log(await response.json());
};

doCheck().catch(error => {
  core.setFailed(error.message);
});
