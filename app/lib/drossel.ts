/**
 * Actions-Drossel (Inhaber 06.10.2026: „fahr github actions erstmal runter“) – gleiche Regel wie scripts/lib/drossel.py.
 * Das Dashboard startet keine GitHub-Abläufe mehr sofort (kein workflow_dispatch über GH_DISPATCH_TOKEN, auch nicht
 * nach einer Probe-Anfrage). Werk-Starts landen als Wunsch in signalwerk.start_requests; der Wachhund (stündlich)
 * startet sie nur, solange im Repo weniger als 5 Läufe aktiv sind.
 */
export const ACTIONS_DIRECT_DISPATCH = false;
