@echo off
REM ============================================================================
REM  Deploy delle Edge Functions con verify_jwt = false
REM ----------------------------------------------------------------------------
REM  Da eseguire dopo il rollover Signing Keys HS256 (2026-04-17) per ripristinare
REM  le notifiche admin e le altre function elencate in supabase/config.toml che
REM  devono accettare l'ANON_KEY come bearer.
REM
REM  Pre-requisiti:
REM    1. Supabase CLI installato (supabase --version)
REM    2. Login fatto (supabase login)
REM    3. Progetto linkato (supabase link --project-ref ppymuuyoveyyoswcimck)
REM
REM  Uso:
REM    Doppio click sul file, oppure da terminale:
REM      scripts\deploy-edge-functions.bat
REM ============================================================================

chcp 65001 > nul
setlocal enabledelayedexpansion

REM Vai nella root del progetto (dove sta la cartella supabase/)
pushd "%~dp0\.."

if not exist "supabase\config.toml" (
    echo [ERRORE] supabase\config.toml non trovato.
    echo Esegui questo script dalla root del progetto Thomas Bresciani.
    popd
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Deploy Edge Functions con verify_jwt = false
echo ============================================================
echo.

REM Lista delle function (le stesse elencate in config.toml con verify_jwt = false)
set FUNCTIONS=create-checkout stripe-webhook reconcile-stripe notify-admin-topup notify-admin-booking notify-admin-cancellation notify-admin-new-client notify-slot-available send-admin-message generate-monthly-report

set /a TOTAL=0
set /a OK=0
set /a FAIL=0
set FAILED_LIST=

for %%F in (%FUNCTIONS%) do (
    set /a TOTAL+=1
    echo.
    echo [!TOTAL!] Deploying %%F ...
    echo ------------------------------------------------------------
    supabase functions deploy %%F --no-verify-jwt
    if !errorlevel! equ 0 (
        set /a OK+=1
        echo [OK] %%F deployata
    ) else (
        set /a FAIL+=1
        set FAILED_LIST=!FAILED_LIST! %%F
        echo [FAIL] %%F NON deployata - errorlevel !errorlevel!
    )
)

echo.
echo ============================================================
echo  Riepilogo
echo ============================================================
echo  Totali:    !TOTAL!
echo  Successo:  !OK!
echo  Fallite:   !FAIL!
if !FAIL! gtr 0 (
    echo  Da rifare:!FAILED_LIST!
)
echo ============================================================
echo.

if !FAIL! gtr 0 (
    echo Una o piu' function NON sono state deployate.
    echo Controlla i log sopra e ri-esegui lo script (idempotente).
) else (
    echo Tutte le function sono state deployate correttamente.
    echo.
    echo Per verificare: fai una prenotazione di test da un account cliente
    echo e controlla i log Edge Function su dashboard Supabase
    echo (notify-admin-booking deve rispondere 200 invece di 401).
)

popd
echo.
pause
endlocal
