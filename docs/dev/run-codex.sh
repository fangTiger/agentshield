#!/bin/zsh
# 用法：./scripts-codex.sh <任务组标签> <提示词文件>
# 以 workspace-write 沙箱调用 Codex（使用用户默认模型），并修正代理拼写
set -e
LABEL=$1; PROMPT_FILE=$2
cd /Users/captain/python/claude/bn-heikesong
export HTTPS_PROXY=http://127.0.0.1:10808 https_proxy=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 http_proxy=http://127.0.0.1:10808
codex exec --skip-git-repo-check -s workspace-write \
  -c sandbox_workspace_write.network_access=true \
  --add-dir ~/.svm --add-dir ~/.foundry --add-dir ~/.npm --add-dir ~/.cache \
  --add-dir ~/Library/pnpm --add-dir ~/Library/Caches/pnpm \
  -C . -o "log/codex_${LABEL}_$(date +%Y%m%d).md" - < "$PROMPT_FILE" > "log/codex_${LABEL}_$(date +%Y%m%d).log" 2>&1
echo "exit=$?"
