
this check ensures that PRs are linked to jira issues by searching the jira api for issues with this pr attached. meaning there are no formatting requriements for the PR itself, the PR could be manually linked in the jira UI.

use it:
```
name: Pull Request Workflow
on:
  pull_request:

jobs:
  linked_issue:
    name: Jira Issue
    runs-on: ubuntu-latest
    steps:
    - uses: openstax/jira-linked-action@v0.1.13
      with:
        jira_site: <jira subdomain> eg: openstx
        jira_project: <jira project> eg: DISCO
        jira_email: ${{ secrets.JiraEmail }}
        jira_token: ${{ secrets.JiraToken }}
```


build and deploy command:
```
export tag=v0.1.13 && test -z "$(git status --porcelain)" && git checkout -b "branch-$tag" && yarn build && git add -f dist && git commit -m "build $tag" && git tag "$tag" && git push --tags
 ```
