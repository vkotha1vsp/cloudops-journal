#!/usr/bin/env bash
# End-to-end smoke test against a running instance that has AUTH_DEV_LOGIN=true.
#   BASE=http://localhost:3000 EMAIL=you@example.com PASSWORD=local-dev-only ./scripts/smoke-test.sh
# For a deployed (Cognito) instance only the unauthenticated checks apply: pass PUBLIC_ONLY=1.
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
EMAIL="${EMAIL:-you@example.com}"
PASSWORD="${PASSWORD:-local-dev-only}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT
pass=0; fail=0

check() { # name expected actual
  if [[ "$2" == "$3" ]]; then echo "  ✔ $1"; pass=$((pass+1)); else echo "  ✘ $1 (expected $2, got $3)"; fail=$((fail+1)); fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
json() { curl -s -b "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" "$@"; }
field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(eval("o."+process.argv[1]) ?? "")})' "$1"; }

echo "Unauthenticated"
check "health endpoint is 200" 200 "$(code "$BASE/api/health")"
check "dashboard redirects to login" 307 "$(code "$BASE/dashboard")"
check "API returns 401 JSON" 401 "$(code "$BASE/api/pages")"
[[ "${PUBLIC_ONLY:-0}" == "1" ]] && { echo "$pass passed, $fail failed"; exit $(( fail > 0 )); }

echo "Sign-in"
csrf=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | field csrfToken)
login() { # email password -> HTTP status of the credentials callback
  curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/callback/dev" \
    --data-urlencode "csrfToken=$csrf" --data-urlencode "email=$1" --data-urlencode "password=$2" --data-urlencode "json=true"
}
check "wrong password rejected" 401 "$(login "$EMAIL" wrong-password)"
check "email outside allow-list rejected" 401 "$(login intruder@example.org "$PASSWORD")"
check "still no session after failed logins" 401 "$(code -b "$JAR" "$BASE/api/pages")"
check "valid login accepted" 200 "$(login "$EMAIL" "$PASSWORD")"
check "dashboard renders after login" 200 "$(code -b "$JAR" "$BASE/dashboard")"

echo "Security"
check "POST without Origin is rejected (CSRF)" 403 "$(code -b "$JAR" -H 'Content-Type: application/json' -X POST -d '{"title":"x"}' "$BASE/api/pages")"
check "POST from foreign Origin is rejected" 403 "$(code -b "$JAR" -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -X POST -d '{"title":"x"}' "$BASE/api/pages")"
check "non-JSON body is rejected" 415 "$(code -b "$JAR" -H "Origin: $BASE" -X POST -d 'title=x' "$BASE/api/pages")"
check "unknown node attributes rejected by schema" 400 "$(code -b "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" -X POST -d '{"title":"x","content":{"type":"doc","evil":1}}' "$BASE/api/pages")"

echo "Journal"
created=$(json -X POST -d '{"title":"Smoke test page"}' "$BASE/api/pages")
id=$(echo "$created" | field page.id); updated=$(echo "$created" | field page.updatedAt)
check "create page" yes "$([[ -n "$id" ]] && echo yes || echo no)"
doc='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"smoketoken kubectl rollout status"}]},{"type":"codeBlock","attrs":{"language":"bash"},"content":[{"type":"text","text":"aws ecs update-service --force-new-deployment"}]}]}'
saved=$(json -X PATCH -d "{\"content\":$doc,\"tags\":[\"Smoke\",\"#ECS\"],\"expectedUpdatedAt\":\"$updated\"}" "$BASE/api/pages/$id")
check "autosave with tags" "smoke,ecs" "$(echo "$saved" | field 'tags.join(",")')"
check "stale write returns 409 conflict" 409 "$(code -b "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" -X PATCH -d "{\"title\":\"stale\",\"expectedUpdatedAt\":\"$updated\"}" "$BASE/api/pages/$id")"
v=$(json -X POST -d '{"note":"smoke version"}' "$BASE/api/pages/$id/versions" | field version.version)
check "named version created" 2 "$v"
check "version list has 2 entries" 2 "$(json "$BASE/api/pages/$id/versions" | field versions.length)"
check "search finds code-block text" yes "$(json "$BASE/api/search?q=force-new-deployment" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).results.some(r=>r.title==="Smoke test page")?"yes":"no"))')"
json -X PATCH -d '{"title":"Renamed page"}' "$BASE/api/pages/$id" >/dev/null
json -X POST "$BASE/api/pages/$id/versions/1" >/dev/null
check "restore v1 brings back original title" "Smoke test page" "$(json "$BASE/api/pages/$id" | field page.title)"
check "bookmark toggles on" true "$(json -X POST -d "{\"entityType\":\"PAGE\",\"entityId\":\"$id\"}" "$BASE/api/bookmarks" | field bookmarked)"
check "page view renders" 200 "$(code -b "$JAR" "$BASE/journal/$id")"
check "history view renders" 200 "$(code -b "$JAR" "$BASE/journal/$id/history")"

echo "Knowledge tree"
cat_id=$(json -X POST -d '{"track":"AWS","name":"Smoke Category"}' "$BASE/api/categories" | field category.id)
topic_id=$(json -X POST -d "{\"categoryId\":\"$cat_id\",\"title\":\"Smoke Topic\"}" "$BASE/api/topics" | field topic.id)
check "topic created in new category" yes "$([[ -n "$topic_id" ]] && echo yes || echo no)"
check "section saved" 200 "$(code -b "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" -X PATCH -d '{"section":{"key":"cli","doc":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"topicsmoketoken"}]}]}}}' "$BASE/api/topics/$topic_id")"
check "history section is read-only" 400 "$(code -b "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" -X PATCH -d '{"section":{"key":"history","doc":{"type":"doc"}}}' "$BASE/api/topics/$topic_id")"
check "progress schedules a review" yes "$(json -X PUT -d '{"status":"LEARNING","confidence":2}' "$BASE/api/topics/$topic_id/progress" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).progress.nextReviewAt?"yes":"no"))')"
check "topic page renders" 200 "$(code -b "$JAR" "$BASE/learn/aws/topic/$topic_id")"
check "topic under wrong track is 404" 404 "$(code -b "$JAR" "$BASE/learn/azure/topic/$topic_id")"
check "search finds topic section text" topic "$(json "$BASE/api/search?q=topicsmoketoken" | field 'results[0].kind')"

echo "Cleanup"
check "delete category cascades topic" 200 "$(code -b "$JAR" -H "Origin: $BASE" -X DELETE "$BASE/api/categories/$cat_id")"
check "deleted topic is gone" 404 "$(code -b "$JAR" "$BASE/api/topics/$topic_id")"
check "delete page" 200 "$(code -b "$JAR" -H "Origin: $BASE" -X DELETE "$BASE/api/pages/$id")"

echo "Pages"
for path in /dashboard /journal /learn/aws /learn/azure /learn/devops /search?q=alb /bookmarks /settings /studio /import; do
  check "GET $path" 200 "$(code -b "$JAR" "$BASE$path")"
done

echo; echo "$pass passed, $fail failed"
exit $(( fail > 0 ))
