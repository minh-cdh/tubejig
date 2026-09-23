#!/bin/sh
# Build and publish dist/ to the gh-pages branch of the "origin" remote.
# Credentials come from this repository's git config (same as a normal `git push`).
set -e
cd "$(dirname "$0")/.."

npm test
npm run build
touch dist/.nojekyll

REMOTE_URL=$(git remote get-url origin)
REV=$(git rev-parse --short HEAD)
HELPERS=$(git config --get-all credential.https://github.com.helper || true)

cd dist
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -q -m "deploy: $REV"
# reuse the parent repo's credential helpers
if [ -n "$HELPERS" ]; then
  echo "$HELPERS" | while IFS= read -r h; do git config --add credential.https://github.com.helper "$h"; done
fi
git push -q -f "$REMOTE_URL" gh-pages
rm -rf .git
echo "Deployed $REV to gh-pages"
