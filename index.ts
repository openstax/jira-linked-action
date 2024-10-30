import * as core from '@actions/core';
import * as github from '@actions/github';
import fetch from 'node-fetch';

interface IssueId {
  id: string;
  key: string;
}

// eg https://openstax.atlassian.net/rest/dev-status/1.0/issue/details?issueId=10066&applicationType=github&dataType=pullrequest
interface DevStatusResponse {
  detail: Array<{
    pullRequests?: Array<{
      url: string
    }>
  }>;
}

interface IssuesResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: IssueId[];
}

/*
 * jira docs:
 *  https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-search/#api-rest-api-2-search-id-post
 *
 *
 * creating a javascript github action:
 *  https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action
 */
const doCheck = async() => {
  const site = core.getInput('jira_site');
  const project = core.getInput('jira_project');
  const authEmail = core.getInput('jira_email');
  const authToken = core.getInput('jira_token');
  const payload = github.context.payload;

  const prUrl = payload.pull_request.html_url;

  const queryDevStatus = (issue: IssueId): Promise<DevStatusResponse> => {
    return fetch(`https://${site}.atlassian.net/rest/dev-status/1.0/issue/details?issueId=${issue.id}&applicationType=github&dataType=pullrequest`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${authEmail}:${authToken}`
        ).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
    })
      .then(response => response.json())
    ;
  };
  const queryIssueIds = (options: {startAt: number}): Promise<IssuesResponse> => {
    const bodyData = JSON.stringify({
      ...options,
      jql: `project = ${project} and resolution is empty and development[pullrequests].all > 0`,
      fields: ['id'],
      maxResults: 1000,
    });

    return fetch(`https://${site}.atlassian.net/rest/api/2/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${authEmail}:${authToken}`
        ).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: bodyData
    })
      .then(response => response.json())
    ;
  };

  const loadAllIssueIds = async (previous: IssueId[] = []): Promise<IssueId[]> => {
    const issuesResponse = await queryIssueIds({startAt: previous.length});
    const newIssues = [...previous, ...issuesResponse.issues];

    if (issuesResponse.issues.length < 1 || issuesResponse.total <= newIssues.length) {
      return newIssues;
    }

    return loadAllIssueIds(newIssues);
  };

  const issueIds = await loadAllIssueIds();
  const matchingIssueIds: IssueId[] = [];

  for (const issue of issueIds) {
    const devStatus = await queryDevStatus(issue);

    if (devStatus.detail.some(integration => integration.pullRequests?.some(pr => pr.url === prUrl))) {
      matchingIssueIds.push(issue);
    }
  }

  if (matchingIssueIds.length < 1) {
    throw new Error('no matching issues found');
  }

  console.dir(matchingIssueIds, {depth: null});

  const matchingIssueIdsString = matchingIssueIds.map(i => i.key).join(',');
  core.setOutput("issues", matchingIssueIdsString);
};

doCheck().catch(error => {
  if (error.message === 'no matching issues found') {
    return new Promise(resolve => setTimeout(resolve, 60000)).then(() => doCheck().catch(err => {
      core.setFailed(err.message);
    }));
  } else {
    core.setFailed(error.message);
  }
});
