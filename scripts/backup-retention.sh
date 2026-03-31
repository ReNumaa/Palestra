#!/bin/bash
# ────────────────────────────────────────────────────────────────────────────
# Retention policy per backup-palestra-*.json su Nextcloud (Umbrel)
#
# Policy:
#   - Ultime 48h  → tutti (orari)
#   - 3-7 giorni  → 1 al giorno (il primo della giornata)
#   - Mensile     → 1° del mese (per i mesi precedenti)
#   - Annuale     → 1° gennaio  (per gli anni precedenti)
#
# Cron (ogni 6h):
#   0 */6 * * * /home/umbrel/backup-retention.sh >> /home/umbrel/backup-retention.log 2>&1
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="/home/umbrel/umbrel/app-data/nextcloud/data/nextcloud/data/Andrew/files/Clienti/Thomas Bresciani/Backup"
CONTAINER="nextcloud_web_1"
PATTERN="backup-palestra-*.json"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "=== DRY RUN — nessun file verrà eliminato ==="
fi

NOW=$(date +%s)
H48=$((NOW - 48 * 3600))       # 48 ore fa
D7=$((NOW  - 7  * 86400))      # 7 giorni fa

deleted=0
kept=0

# Raccoglie tutti i file backup ordinati dal più vecchio al più recente
mapfile -t FILES < <(find "$BACKUP_DIR" -maxdepth 1 -name "$PATTERN" -type f | sort)

if [[ ${#FILES[@]} -eq 0 ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M')] Nessun file trovato"
    exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M')] Trovati ${#FILES[@]} backup, applico retention..."

declare -A kept_daily=()
declare -A kept_monthly=()
declare -A kept_yearly=()

for f in "${FILES[@]}"; do
    fname=$(basename "$f")

    # Estrai data/ora dal nome: backup-palestra-YYYY-MM-DD_HHMMSS.json
    if [[ "$fname" =~ ([0-9]{4})-([0-9]{2})-([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2}) ]]; then
        year="${BASH_REMATCH[1]}"
        month="${BASH_REMATCH[2]}"
        day="${BASH_REMATCH[3]}"
        hour="${BASH_REMATCH[4]}"
        min="${BASH_REMATCH[5]}"
        sec="${BASH_REMATCH[6]}"

        file_ts=$(date -d "${year}-${month}-${day} ${hour}:${min}:${sec}" +%s 2>/dev/null || echo 0)
        date_key="${year}-${month}-${day}"
        month_key="${year}-${month}"
        year_key="${year}"
    else
        echo "  KEEP (nome non standard): $fname"
        ((kept++))
        continue
    fi

    action="DELETE"

    # ── Regola 1: ultime 48h → tieni tutto ──────────────────────────────
    if [[ $file_ts -ge $H48 ]]; then
        action="KEEP"

    # ── Regola 2: 3-7 giorni → 1 al giorno (primo della giornata) ──────
    elif [[ $file_ts -ge $D7 ]]; then
        if [[ -z "${kept_daily[$date_key]:-}" ]]; then
            kept_daily[$date_key]=1
            action="KEEP"
        fi

    # ── Regola 3: mensile → solo il 1° del mese ────────────────────────
    elif [[ "$day" == "01" ]]; then
        if [[ "$month" == "01" ]]; then
            # 1° gennaio → retention annuale
            if [[ -z "${kept_yearly[$year_key]:-}" ]]; then
                kept_yearly[$year_key]=1
                action="KEEP"
            fi
        else
            # 1° di altri mesi → retention mensile
            if [[ -z "${kept_monthly[$month_key]:-}" ]]; then
                kept_monthly[$month_key]=1
                action="KEEP"
            fi
        fi
    fi

    if [[ "$action" == "DELETE" ]]; then
        if $DRY_RUN; then
            echo "  DEL (dry): $fname"
        else
            rm -f "$f"
            echo "  DEL: $fname"
        fi
        ((deleted++))
    else
        echo "  KEEP: $fname"
        ((kept++))
    fi
done

echo "[$(date '+%Y-%m-%d %H:%M')] Fatto. Tenuti: $kept | Eliminati: $deleted"

# Riscansiona Nextcloud
if ! $DRY_RUN && [[ $deleted -gt 0 ]]; then
    docker exec -u www-data "$CONTAINER" php occ files:scan \
        --path="Andrew/files/Clienti/Thomas Bresciani/Backup" --shallow 2>/dev/null || true
fi
