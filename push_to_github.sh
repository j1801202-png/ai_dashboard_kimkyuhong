#!/usr/bin/env bash
set -e

echo "GitHub 푸시 스크립트를 시작합니다."

read -p "GitHub 사용자명 또는 조직명: " GITHUB_USER
read -p "저장소명: " REPO_NAME
read -p "커밋 메시지 [update dashboard]: " COMMIT_MSG

COMMIT_MSG=${COMMIT_MSG:-update dashboard}

if [ ! -d ".git" ]; then
  git init
fi

git add .
git commit -m "$COMMIT_MSG" || echo "변경사항이 없어 커밋을 건너뜁니다."

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
fi

git branch -M main
git push -u origin main

echo "푸시가 완료되었습니다."
