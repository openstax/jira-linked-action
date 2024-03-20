

build and deply command:
```
 export tag=v0.1.11 && git status --porcelain && git checkout -b "branch-$tag" && yarn build && git add -f dist && git commit -m "build $tag" && git tag "$tag" && git push --tags
 ```
