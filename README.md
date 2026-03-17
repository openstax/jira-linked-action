this check ensures that PRs are linked to jira issues by searching the jira api for issues with this pr attached. meaning there are no formatting requriements for the PR itself, the PR could be manually linked in the jira UI.

the action first attempts a fast search by extracting Jira issue keys (e.g., `CORE-123`) from the PR title, description, and commit messages, then checks those specific issues. If no issue keys are found or they don't match, it falls back to searching all unresolved issues with PRs.

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
    - uses: openstax/jira-linked-action@v0.1.16
      with:
        jira_site: <jira subdomain> eg: openstax
        jira_project: <jira project> eg: DISCO
        jira_email: ${{ secrets.JiraEmail }}
        jira_token: ${{ secrets.JiraToken }}
```

this action has a hardcoded redirect mapping where `DISCO` → `CORE`. If you configure `jira_project: DISCO`, the action will search for `CORE-*` issue keys instead. This is specific to openstax's project rename.

build and deploy command:
```
export tag=v0.1.16 && test -z "$(git status --porcelain)" && git checkout -b "branch-$tag" && yarn build && git add -f dist && git commit -m "build $tag" && git tag "$tag" && git push --tags
 ```
