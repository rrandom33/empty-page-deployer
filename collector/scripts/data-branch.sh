#!/usr/bin/env bash
# Gestiona la rama `data`: huérfana, de un solo commit, reescrita en cada ejecución.
#   data-branch.sh pull <remoto> <directorio>   descarga solo los ficheros necesarios
#   data-branch.sh push <directorio>            reescribe el commit y fuerza el envío
set -euo pipefail

BRANCH=data
RETENTION_DAYS="${RETENTION_DAYS:-30}"

case "${1:-}" in
  pull)
    remote="$2"; dir="$3"
    if git ls-remote --exit-code --heads "$remote" "$BRANCH" >/dev/null 2>&1; then
      # Clon parcial: los ficheros horarios antiguos no se descargan.
      git clone --quiet --depth 1 --filter=blob:none --no-checkout --branch "$BRANCH" "$remote" "$dir"
      cd "$dir"
      today=$(date -u +%F); yesterday=$(date -u -d '1 day ago' +%F)
      git sparse-checkout set --no-cone \
        '/meta.json' '/state/' \
        "/hourly/$today.json.gz" "/hourly/$yesterday.json.gz" \
        "/daily/${today:0:7}.json.gz" "/daily/${yesterday:0:7}.json.gz"
      git checkout --quiet "$BRANCH"
    else
      git init --quiet -b "$BRANCH" "$dir"
      git -C "$dir" remote add origin "$remote"
    fi
    ;;
  push)
    cd "$2"
    git config user.name 'github-actions[bot]'
    git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
    git add -A
    # Los ficheros horarios con más de RETENTION_DAYS días se retiran del índice.
    cutoff=$(date -u -d "$RETENTION_DAYS days ago" +%F)
    git ls-files 'hourly/*.json.gz' | while read -r file; do
      day=$(basename "$file" .json.gz)
      if [[ "$day" < "$cutoff" ]]; then git update-index --force-remove "$file"; fi
    done
    message="Datos: $(date -u +%FT%TZ)"
    if git rev-parse --verify --quiet HEAD >/dev/null; then
      git commit --quiet --amend --reset-author -m "$message"
    else
      git commit --quiet -m "$message"
    fi
    git push --quiet --force origin "$BRANCH"
    ;;
  *)
    echo "Uso: $0 pull <remoto> <directorio> | push <directorio>" >&2
    exit 2
    ;;
esac
