import * as core from '@actions/core';
import * as github from '@actions/github';

// Project redirect mapping (e.g., when a project is renamed)
const projectRedirects: Record<string, string> = {
  'DISCO': 'CORE',
};

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
  issues: IssueId[];
  isLast: boolean;
  nextPageToken?: string;
}

class ApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;

  constructor(
    public response: Response,
    public responseBody?: string
  ) {
    const status = response.status;
    const statusText = response.statusText;
    super(`HTTP ${status} ${statusText}${responseBody ? `: ${responseBody}` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
  }

  static async create(response: Response): Promise<ApiError> {
    const errorText = await response.text();
    return new ApiError(response, errorText);
  }
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
  const projectInput = core.getInput('jira_project');
  const project = projectRedirects[projectInput] || projectInput;
  const authEmail = core.getInput('jira_email');
  const authToken = core.getInput('jira_token');
  const payload = github.context.payload;

  const prUrl = payload.pull_request.html_url;
  const prTitle = payload.pull_request.title;
  const prBody = payload.pull_request.body || '';

  // Get GitHub token for API calls (automatically available in GitHub Actions)
  const githubToken = process.env.GITHUB_TOKEN;
  const octokit = githubToken ? github.getOctokit(githubToken) : null;

  // Extract issue keys from text using regex
  const extractIssueKeys = (text: string): string[] => {
    const regex = new RegExp(`\\b${project}-\\d+\\b`, 'gi');
    const matches = text.match(regex);
    return matches ? [...new Set(matches.map(m => m.toUpperCase()))] : [];
  };

  // Get commits and extract issue keys from commit messages
  const getCommitIssueKeys = async(): Promise<string[]> => {
    if (!octokit) return [];

    try {
      const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: payload.pull_request.number,
        per_page: 100,
      });

      const allKeys: string[] = [];
      commits.forEach(commit => {
        if (commit.commit.message) {
          allKeys.push(...extractIssueKeys(commit.commit.message));
        }
      });
      return [...new Set(allKeys)];
    } catch (error) {
      console.error('Could not fetch commits:', error);
      return [];
    }
  };

  // Query specific issues by keys
  const queryIssuesByKeys = async(issueKeys: string[]): Promise<IssueId[]> => {
    if (issueKeys.length === 0) return [];

    const jql = `key in (${issueKeys.join(',')})`;
    const bodyData = JSON.stringify({
      jql,
      fields: ['id', 'key'],
      maxResults: issueKeys.length,
    });

    try {
      const response = await fetch(`https://${site}.atlassian.net/rest/api/3/search/jql`, {
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

      if (!response.ok) {
        throw await ApiError.create(response);
      }

      const data = await response.json();
      return data.issues || [];
    } catch (error) {
      console.error('Error querying issues by keys:', error);
      return [];
    }
  };

  const queryDevStatus = async(issue: IssueId): Promise<DevStatusResponse> => {
    try {
      const response = await fetch(`https://${site}.atlassian.net/rest/dev-status/1.0/issue/details?issueId=${issue.id}&applicationType=github&dataType=pullrequest`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(
            `${authEmail}:${authToken}`
          ).toString('base64')}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
      });

      if (!response.ok) {
        throw await ApiError.create(response);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error querying dev status for issue ${issue.key}:`, error);
      return { detail: [] };
    }
  };
  const queryIssueIds = async(options: {nextPageToken?: string}): Promise<IssuesResponse> => {
    const bodyData = JSON.stringify({
      ...options,
      jql: `project = ${project} and resolution is empty and development[pullrequests].all > 0`,
      fields: ['id', 'key'],
      maxResults: 1000,
    });

    try {
      const response = await fetch(`https://${site}.atlassian.net/rest/api/3/search/jql`, {
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

      if (!response.ok) {
        throw await ApiError.create(response);
      }

      return await response.json();
    } catch (error) {
      console.error('Error querying issue IDs:', error);
      return { issues: [], isLast: true };
    }
  };

  const loadAllIssueIds = async (): Promise<IssueId[]> => {
    let issues: IssueId[] = [];
    let nextPageToken: string | undefined = undefined;

    while (true) {
      const issuesResponse = await queryIssueIds(nextPageToken ? {nextPageToken} : {});
      issues = issues.concat(issuesResponse.issues);
      nextPageToken = issuesResponse.nextPageToken;

      if (issuesResponse.isLast || !nextPageToken) {
        return issues;
      }
    }
  };

  // Find matching issues
  const findMatchingIssues = async(issueIds: IssueId[]): Promise<IssueId[]> => {
    const matchingIssueIds: IssueId[] = [];

    for (const issue of issueIds) {
      const devStatus = await queryDevStatus(issue);
      const allPrUrls: string[] = [];
      devStatus.detail.forEach(integration => {
        integration.pullRequests?.forEach(pr => {
          allPrUrls.push(pr.url);
        });
      });
      console.log(`Issue ${issue.key} is linked to the following PRs:`, allPrUrls);

      if (devStatus.detail.some(integration =>
        integration.pullRequests?.some(pr => pr.url === prUrl)
      )) {
        matchingIssueIds.push(issue);
      }
    }

    return matchingIssueIds;
  };

  // Try fast path: extract issue keys from PR and commits
  const titleKeys = extractIssueKeys(prTitle);
  const bodyKeys = extractIssueKeys(prBody);
  const commitKeys = await getCommitIssueKeys();
  const allExtractedKeys = [...new Set([...titleKeys, ...bodyKeys, ...commitKeys])];

  console.log('Found issue keys:', allExtractedKeys);

  let matchingIssueIds: IssueId[] = [];

  if (allExtractedKeys.length > 0) {
    const extractedIssues = await queryIssuesByKeys(allExtractedKeys);
    matchingIssueIds = await findMatchingIssues(extractedIssues);
  }

  // Fall back to slow path if fast path didn't find anything
  if (matchingIssueIds.length === 0) {
    console.log('No issues found by key. Falling back to searching all issues...');
    const issueIds = await loadAllIssueIds();
    console.log(`Checking ${issueIds.length} issue(s) with PRs...`);
    matchingIssueIds = await findMatchingIssues(issueIds);
  }

  if (matchingIssueIds.length < 1) {
    throw new Error('No matching issues found');
  }

  const matchingIssueIdsString = matchingIssueIds.map(i => i.key).join(',');
  core.setOutput("issues", matchingIssueIdsString);
};

doCheck().catch(async error => {
  if (error.message === 'No matching issues found') {
    return new Promise(resolve => setTimeout(resolve, 60000)).then(() => doCheck().catch(err => {
      core.setFailed(err.message);
    }));
  } else {
    core.setFailed(error.message);
  }
});
